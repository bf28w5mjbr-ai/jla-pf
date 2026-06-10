import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/server/db";
import {
  parseClubIdFromClubCompetitionEntryFeeOwnerId,
} from "@/lib/competitionStripeDisputeAccess";
import { summarizeCompetitionStripeFinance } from "@/lib/competitionFinanceSummary";
import {
  hasOrganizerPostPayApproval,
  isEntryFeeSettled,
} from "@/lib/entryOrganizerPostPay";
import { getPlatformFeeBps } from "@/lib/platformFee";
import { stripe } from "@/lib/stripe";
import {
  buildClubPrepaidIndividualPaymentOwnerId,
  buildTeamEntryPaymentOwnerId,
  isClubPrepaidIndividualPaymentOwnerId,
} from "@/lib/teamEntryPayments";
import CompetitionDisputeEvidencePanel, {
  type DisputeEvidenceRow,
} from "@/components/admin/CompetitionDisputeEvidencePanel";
import { CompetitionBalanceSheetPanel } from "@/components/admin/CompetitionBalanceSheetPanel";

type Props = {
  organizationId: string;
  competitionId: string;
  canEdit: boolean;
  /** 事業パネル内に埋め込むとき外枠 Card を省略 */
  embedded?: boolean;
};

const formatYen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

async function stripeDisputeSummary(disputeId: string): Promise<{
  status: string;
  dueByLabel: string | null;
}> {
  try {
    const d = await stripe.disputes.retrieve(disputeId);
    const due = d.evidence_details?.due_by;
    return {
      status: d.status,
      dueByLabel: typeof due === "number" ? new Date(due * 1000).toLocaleString("ja-JP") : null,
    };
  } catch {
    return { status: "（Stripe参照失敗）", dueByLabel: null };
  }
}

function Stat({
  label,
  value,
  valueClassName,
  sub,
  compact = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  sub?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="min-w-0 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
        <p className="truncate text-[10px] font-medium leading-tight text-muted-foreground">{label}</p>
        <p className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${valueClassName ?? ""}`}>
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 border-b border-border/60 pb-2 last:border-0 last:pb-0 sm:border-0 sm:pb-0">
      <p className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${valueClassName ?? ""}`}>
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 break-words text-[10px] leading-snug text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}

const financeFoldSummaryClass =
  "flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-xs font-medium text-foreground marker:content-none hover:bg-muted/40 [&::-webkit-details-marker]:hidden";

function FinanceFoldSection({
  summary,
  children,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group rounded-md border border-border/70 bg-muted/10 ${className ?? ""}`}>
      <summary className={financeFoldSummaryClass}>{summary}</summary>
      <div className="space-y-2 border-t border-border/60 px-2.5 py-2">{children}</div>
    </details>
  );
}

export default async function CompetitionFinanceTabContent({
  organizationId,
  competitionId,
  canEdit,
  embedded = false,
}: Props) {
  if (!canEdit) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">事業収支</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          このタブは主催団体管理者のみ閲覧できます。
        </CardContent>
      </Card>
    );
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: { select: { stripeConnectAccountId: true } },
    },
  });

  if (!competition || competition.organizationId !== organizationId) {
    notFound();
  }

  const [entries, teamEntries, expenses, balanceLines] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: { competitionId: competition.id },
      select: {
        totalFee: true,
        status: true,
        clubIndividualFeePaidAt: true,
        organizerPostPayApprovedAt: true,
        organizerManualPaidAt: true,
        checkoutSessions: {
          orderBy: { createdAt: "desc" },
          select: { status: true, amount: true, payload: true },
        },
      },
    }),
    prisma.teamEntry.findMany({
      where: { competitionId: competition.id },
      select: { clubId: true },
    }),
    prisma.expense.findMany({
      where: {
        ownerType: "COMPETITION",
        ownerId: competition.id,
      },
      select: { status: true, totalAmount: true },
    }),
    prisma.competitionBalanceLine.findMany({
      where: { competitionId: competition.id },
      orderBy: [{ lineDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        lineDate: true,
        accountSubject: true,
        kind: true,
        amount: true,
        notes: true,
      },
    }),
  ]);

  let individualPending = 0;
  let postPayApprovedUnsettled = 0;
  let postPayApprovedUnsettledCount = 0;
  for (const e of entries) {
    if (e.status === "CANCELLED") continue;
    if (e.totalFee <= 0) continue;
    const feeInput = {
      status: e.status,
      totalFee: e.totalFee,
      clubIndividualFeePaidAt: e.clubIndividualFeePaidAt,
      organizerManualPaidAt: e.organizerManualPaidAt,
      checkoutSessions: e.checkoutSessions.map((s) => ({ status: s.status })),
    };
    if (isEntryFeeSettled(feeInput)) {
      continue;
    }
    individualPending += e.totalFee;
    if (hasOrganizerPostPayApproval(e)) {
      postPayApprovedUnsettled += e.totalFee;
      postPayApprovedUnsettledCount += 1;
    }
  }

  const clubIds = [...new Set(teamEntries.map((t) => t.clubId))];
  const teamAndPrepaidOwnerIds = clubIds.flatMap((cid) => [
    buildTeamEntryPaymentOwnerId(competition.id, cid),
    buildClubPrepaidIndividualPaymentOwnerId(competition.id, cid),
  ]);
  const teamPayments =
    teamAndPrepaidOwnerIds.length > 0
      ? await prisma.payment.findMany({
          where: {
            ownerType: "CLUB",
            ownerId: { in: teamAndPrepaidOwnerIds },
            type: "COMPETITION_ENTRY_FEE",
          },
          select: { ownerId: true, status: true, amount: true, metadata: true },
        })
      : [];

  const stripeFinance = summarizeCompetitionStripeFinance({
    entries,
    teamPayments,
  });
  const platformFeePercentLabel = (getPlatformFeeBps() / 100).toFixed(
    getPlatformFeeBps() % 100 === 0 ? 0 : 1
  );

  let teamPending = 0;
  for (const p of teamPayments) {
    if (p.status === "PENDING") {
      teamPending += p.amount;
    }
  }

  const clubsWithTeamEntryButNoSucceededPayment = clubIds.filter((cid) => {
    const teamOid = buildTeamEntryPaymentOwnerId(competition.id, cid);
    const prepaidOid = buildClubPrepaidIndividualPaymentOwnerId(competition.id, cid);
    const teamPay = teamPayments.find((x) => x.ownerId === teamOid);
    const prepaidPay = teamPayments.find((x) => x.ownerId === prepaidOid);
    const teamOk = teamPay?.status === "SUCCEEDED" || (teamPay?.amount ?? 0) <= 0;
    const prepaidOk =
      !prepaidPay ||
      prepaidPay.amount <= 0 ||
      prepaidPay.status === "SUCCEEDED";
    return !(teamOk && prepaidOk);
  }).length;

  const expensePaidTotal = expenses
    .filter((x) => x.status === "PAID")
    .reduce((s, x) => s + x.totalAmount, 0);
  const expenseApprovedUnpaid = expenses
    .filter((x) => x.status === "APPROVED")
    .reduce((s, x) => s + x.totalAmount, 0);

  const netAfterPaidExpenses =
    stripeFinance.entryIncomeNetYen - stripeFinance.platformFeeYen - expensePaidTotal;

  let manualIncome = 0;
  let manualExpense = 0;
  for (const bl of balanceLines) {
    if (bl.kind === "INCOME") manualIncome += bl.amount;
    else manualExpense += bl.amount;
  }
  const manualNet = manualIncome - manualExpense;

  const balanceLineDtos = balanceLines.map((bl) => ({
    id: bl.id,
    lineDate: bl.lineDate.toISOString().slice(0, 10),
    accountSubject: bl.accountSubject,
    kind: bl.kind as "INCOME" | "EXPENSE",
    amount: bl.amount,
    notes: bl.notes,
  }));

  const teamSubParts: string[] = [];
  if (teamPending > 0) teamSubParts.push(`処理中 ${formatYen(teamPending)}`);
  if (clubsWithTeamEntryButNoSucceededPayment > 0) {
    teamSubParts.push(`未入金クラブ ${clubsWithTeamEntryButNoSucceededPayment}件`);
  }
  const entryIncomeSubParts = [
    "参加費 B",
    `グロス ${formatYen(stripeFinance.entryGrossYen)}`,
  ];
  if (stripeFinance.entryRefundYen > 0) {
    entryIncomeSubParts.push(`返金 ${formatYen(stripeFinance.entryRefundYen)}`);
  }
  const supplementalAutoStats: ReactNode[] = [];
  if (individualPending > 0) {
    supplementalAutoStats.push(
      <Stat key="individual-pending" label="個人（未決済）" value={formatYen(individualPending)} />
    );
  }
  if (postPayApprovedUnsettled > 0) {
    supplementalAutoStats.push(
      <Stat
        key="post-pay-approved-unsettled"
        label="個人（後払い・未入金）"
        value={formatYen(postPayApprovedUnsettled)}
        sub={
          postPayApprovedUnsettledCount > 0
            ? `${postPayApprovedUnsettledCount}件`
            : undefined
        }
      />
    );
  }
  if (teamPending > 0) {
    supplementalAutoStats.push(
      <Stat
        key="team-pending"
        label="チーム（Stripe未入金）"
        value={formatYen(teamPending)}
        sub={teamSubParts.length > 0 ? teamSubParts.join(" · ") : undefined}
      />
    );
  }
  if (expensePaidTotal > 0) {
    supplementalAutoStats.push(
      <Stat
        key="expense-paid"
        label="経費（支払済）"
        value={formatYen(expensePaidTotal)}
        sub={
          expenseApprovedUnpaid > 0
            ? `承認済未払 ${formatYen(expenseApprovedUnpaid)}`
            : undefined
        }
      />
    );
  }

  const teamOwnerPrefix = `competition-team-entry:${competition.id}:`;
  const prepaidOwnerPrefix = `competition-club-prepaid-individual:${competition.id}:`;
  const [openEntryDisputes, openTeamDisputes] = await Promise.all([
    prisma.entryCheckoutSession.findMany({
      where: {
        competitionId: competition.id,
        status: "DISPUTED",
        stripeDisputeId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        stripeDisputeId: true,
        amount: true,
        user: { select: { profile: { select: { familyName: true, givenName: true } }, email: true } },
      },
    }),
    prisma.payment.findMany({
      where: {
        status: "DISPUTED",
        type: "COMPETITION_ENTRY_FEE",
        ownerType: "CLUB",
        OR: [
          { ownerId: { startsWith: teamOwnerPrefix } },
          { ownerId: { startsWith: prepaidOwnerPrefix } },
        ],
        stripeDisputeId: { not: null },
      },
      select: {
        stripeDisputeId: true,
        amount: true,
        ownerId: true,
      },
    }),
  ]);

  const disputedClubIds = [
    ...new Set(
      openTeamDisputes
        .map((p) => parseClubIdFromClubCompetitionEntryFeeOwnerId(competition.id, p.ownerId))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const disputedClubs =
    disputedClubIds.length > 0
      ? await prisma.club.findMany({
          where: { id: { in: disputedClubIds } },
          select: { id: true, name: true },
        })
      : [];
  const disputedClubMap = new Map(disputedClubs.map((c) => [c.id, c.name]));

  const [entryDisputeRows, teamDisputeRows] = await Promise.all([
    Promise.all(
      openEntryDisputes.map(async (row) => {
        const disputeId = row.stripeDisputeId;
        if (!disputeId) return null;
        const sum = await stripeDisputeSummary(disputeId);
        return {
          disputeId,
          scopeLabel: `個人エントリー: ${row.user.profile?.familyName ?? ""} ${row.user.profile?.givenName ?? ""}（${row.user.email}）`,
          amountYen: row.amount,
          dueByLabel: sum.dueByLabel,
          stripeStatus: sum.status,
        } satisfies DisputeEvidenceRow;
      })
    ),
    Promise.all(
      openTeamDisputes.map(async (row) => {
        const disputeId = row.stripeDisputeId;
        if (!disputeId) return null;
        const clubId = parseClubIdFromClubCompetitionEntryFeeOwnerId(competition.id, row.ownerId);
        const clubName = clubId ? disputedClubMap.get(clubId) : undefined;
        const sum = await stripeDisputeSummary(disputeId);
        const scopeKind = isClubPrepaidIndividualPaymentOwnerId(row.ownerId)
          ? "クラブ個人枠請求"
          : "チーム請求";
        return {
          disputeId,
          scopeLabel: `${scopeKind}: ${clubName ?? "クラブ"}${clubId ? `（${clubId}）` : ""}`,
          amountYen: row.amount,
          dueByLabel: sum.dueByLabel,
          stripeStatus: sum.status,
        } satisfies DisputeEvidenceRow;
      })
    ),
  ]);
  const disputeRows: DisputeEvidenceRow[] = [
    ...entryDisputeRows.filter((row): row is DisputeEvidenceRow => row != null),
    ...teamDisputeRows.filter((row): row is DisputeEvidenceRow => row != null),
  ];

  const hasFinanceDetailAlerts =
    supplementalAutoStats.length > 0 ||
    stripeFinance.platformFeeRefundYen > 0 ||
    expenseApprovedUnpaid > 0;

  const manualSummaryParts: string[] = [];
  if (balanceLineDtos.length > 0) {
    manualSummaryParts.push(`${balanceLineDtos.length}行`);
  }
  if (manualNet !== 0) {
    manualSummaryParts.push(`差額 ${formatYen(manualNet)}`);
  }

  const body = (
    <>
      <section aria-label="Stripe 集計サマリ">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <Stat compact label="エントリー収入" value={formatYen(stripeFinance.entryIncomeNetYen)} />
          <Stat
            compact
            label={`PF ${platformFeePercentLabel}%`}
            value={formatYen(stripeFinance.platformFeeYen)}
          />
          <Stat
            compact
            label="差引"
            value={formatYen(netAfterPaidExpenses)}
            valueClassName="text-primary"
          />
        </div>
      </section>

      <FinanceFoldSection
        summary={
          <>
            <span>詳細</span>
            {hasFinanceDetailAlerts ? (
              <span className="text-[10px] font-normal text-amber-700 dark:text-amber-400">要確認</span>
            ) : null}
          </>
        }
      >
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Stripe カード決済のみ（Webhook 同期済みの DB 集計）。手動入金・クラブ一括は含みません。差引 =
          エントリー収入 − PF手数料 − 経費（支払済）。
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Stat
            label="エントリー収入（内訳）"
            value={formatYen(stripeFinance.entryIncomeNetYen)}
            sub={entryIncomeSubParts.join(" · ")}
          />
          <Stat
            label={`PF手数料（${platformFeePercentLabel}%）`}
            value={formatYen(stripeFinance.platformFeeYen)}
            sub={
              stripeFinance.platformFeeRefundYen > 0
                ? `返金付随 −${formatYen(stripeFinance.platformFeeRefundYen)}（グロス ${formatYen(stripeFinance.platformFeeGrossYen)}）`
                : undefined
            }
          />
        </div>
        {supplementalAutoStats.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {supplementalAutoStats}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">未収・経費の保留項目はありません。</p>
        )}
      </FinanceFoldSection>

      {disputeRows.length > 0 ? (
        <FinanceFoldSection
          className="border-amber-200/80 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20"
          summary={
            <>
              <span>紛争（チャージバック）</span>
              <span className="text-[10px] font-normal text-muted-foreground">{disputeRows.length}件</span>
            </>
          }
        >
          <CompetitionDisputeEvidencePanel
            organizationId={organizationId}
            competitionId={competition.id}
            rows={disputeRows}
            embedded
          />
        </FinanceFoldSection>
      ) : null}

      <FinanceFoldSection
        summary={
          <>
            <span>手動仕訳</span>
            {manualSummaryParts.length > 0 ? (
              <span className="text-[10px] font-normal text-muted-foreground">
                {manualSummaryParts.join(" · ")}
              </span>
            ) : null}
          </>
        }
      >
        <p className="text-[11px] text-muted-foreground">
          下表と連動。エントリー集計とは別です。
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
          <span>
            収入{" "}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {formatYen(manualIncome)}
            </span>
          </span>
          <span>
            支出{" "}
            <span className="font-semibold text-rose-700 dark:text-rose-400">
              {formatYen(manualExpense)}
            </span>
          </span>
          <span>
            差額 <span className="font-semibold">{formatYen(manualNet)}</span>
          </span>
        </div>
        <CompetitionBalanceSheetPanel
          competitionId={competition.id}
          initialLines={balanceLineDtos}
        />
      </FinanceFoldSection>
    </>
  );

  if (embedded) {
    return <div className="min-w-0 space-y-2">{body}</div>;
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="border-b border-border bg-muted/30 py-2.5">
        <CardTitle className="text-base">事業収支</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-2 p-2.5 sm:p-3">{body}</CardContent>
    </Card>
  );
}
