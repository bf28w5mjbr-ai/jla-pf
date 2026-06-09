import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/server/db";
import {
  parseClubIdFromClubCompetitionEntryFeeOwnerId,
} from "@/lib/competitionStripeDisputeAccess";
import { summarizeCompetitionStripeFinance } from "@/lib/competitionFinanceSummary";
import { reconcileCompetitionEntryCheckoutRefundsFromStripe, listCompetitionStripeConnectOrphanRefunds } from "@/lib/entryCheckoutStripeRefund";
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
}: {
  label: string;
  value: string;
  valueClassName?: string;
  sub?: string;
}) {
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

export default async function CompetitionFinanceTabContent({
  organizationId,
  competitionId,
  canEdit,
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

  await reconcileCompetitionEntryCheckoutRefundsFromStripe(competition.id, {
    maxPiScans: 40,
  });

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

  const connectAccountId = competition.organization.stripeConnectAccountId;
  const stripeOrphanRefunds =
    connectAccountId != null
      ? await listCompetitionStripeConnectOrphanRefunds(competition.id, connectAccountId)
      : [];

  const stripeFinance = summarizeCompetitionStripeFinance({
    entries,
    teamPayments,
    stripeOrphanRefunds,
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

  const disputeRows: DisputeEvidenceRow[] = [];
  for (const row of openEntryDisputes) {
    const disputeId = row.stripeDisputeId;
    if (!disputeId) continue;
    const sum = await stripeDisputeSummary(disputeId);
    disputeRows.push({
      disputeId,
      scopeLabel: `個人エントリー: ${row.user.profile?.familyName ?? ""} ${row.user.profile?.givenName ?? ""}（${row.user.email}）`,
      amountYen: row.amount,
      dueByLabel: sum.dueByLabel,
      stripeStatus: sum.status,
    });
  }
  for (const row of openTeamDisputes) {
    const disputeId = row.stripeDisputeId;
    if (!disputeId) continue;
    const clubId = parseClubIdFromClubCompetitionEntryFeeOwnerId(competition.id, row.ownerId);
    const clubName = clubId ? disputedClubMap.get(clubId) : undefined;
    const sum = await stripeDisputeSummary(disputeId);
    const scopeKind = isClubPrepaidIndividualPaymentOwnerId(row.ownerId)
      ? "クラブ個人枠請求"
      : "チーム請求";
    disputeRows.push({
      disputeId,
      scopeLabel: `${scopeKind}: ${clubName ?? "クラブ"}${clubId ? `（${clubId}）` : ""}`,
      amountYen: row.amount,
      dueByLabel: sum.dueByLabel,
      stripeStatus: sum.status,
    });
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="space-y-1 border-b border-border bg-muted/30 py-3">
        <CardTitle className="text-base">事業収支</CardTitle>
        <p className="text-xs text-muted-foreground">{competition.name}</p>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 p-3 sm:p-4">
        <section aria-labelledby="finance-auto-heading">
          <h3 id="finance-auto-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            自動集計（Stripe 決済・経費ワークフロー）
          </h3>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            Stripe カード決済のみ（表示時に Connect 返金を同期）。手動入金・クラブ一括は含みません。
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              label="1. エントリー収入"
              value={formatYen(stripeFinance.entryIncomeNetYen)}
              sub={`参加費 B · グロス ${formatYen(stripeFinance.entryGrossYen)} · 返金 ${formatYen(stripeFinance.entryRefundYen)}`}
            />
            <Stat
              label={`2. PF手数料（${platformFeePercentLabel}%）`}
              value={formatYen(stripeFinance.platformFeeYen)}
              sub={
                stripeFinance.platformFeeRefundYen > 0
                  ? `返金付随 −${formatYen(stripeFinance.platformFeeRefundYen)}（グロス ${formatYen(stripeFinance.platformFeeGrossYen)}）`
                  : undefined
              }
            />
            <Stat
              label="3. Stripe手数料差額"
              value={formatYen(stripeFinance.stripeProcessingSurplusYen)}
              valueClassName={
                stripeFinance.stripeProcessingSurplusYen < 0 ? "text-destructive" : undefined
              }
              sub={[
                `上乗せ ${formatYen(stripeFinance.processingFeeCollectedYen)} · 実手数料 ${formatYen(stripeFinance.actualStripeFeeYen)}`,
                !stripeFinance.stripeFeeDataComplete
                  ? `一部決済の実手数料未取得（${stripeFinance.stripeFeeRecordedCount}/${stripeFinance.stripeFeeExpectedCount}件）`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="個人（未決済）" value={formatYen(individualPending)} />
            <Stat
              label="個人（後払い・未入金）"
              value={formatYen(postPayApprovedUnsettled)}
              sub={
                postPayApprovedUnsettledCount > 0
                  ? `${postPayApprovedUnsettledCount}件`
                  : undefined
              }
            />
            <Stat
              label="チーム（Stripe未入金）"
              value={formatYen(teamPending)}
              sub={teamSubParts.length > 0 ? teamSubParts.join(" · ") : undefined}
            />
            <Stat
              label="経費（支払済）"
              value={formatYen(expensePaidTotal)}
              sub={
                expenseApprovedUnpaid > 0
                  ? `承認済未払 ${formatYen(expenseApprovedUnpaid)}`
                  : undefined
              }
            />
          </div>
          <div className="mt-3 border-t border-border/60 pt-3">
            <Stat
              label="差引（エントリー収入 − PF − 経費）"
              value={formatYen(netAfterPaidExpenses)}
              valueClassName="text-primary"
            />
          </div>
        </section>

        <CompetitionDisputeEvidencePanel
          organizationId={organizationId}
          competitionId={competition.id}
          rows={disputeRows}
        />

        <section
          aria-labelledby="finance-manual-heading"
          className="rounded-md border border-border/80 bg-muted/20 px-3 py-2.5"
        >
          <h3 id="finance-manual-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            手動仕訳（下表と連動・エントリー集計とは別）
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="収入"
              value={formatYen(manualIncome)}
              valueClassName="text-emerald-700 dark:text-emerald-400"
            />
            <Stat
              label="支出"
              value={formatYen(manualExpense)}
              valueClassName="text-rose-700 dark:text-rose-400"
            />
            <Stat label="差額" value={formatYen(manualNet)} />
          </div>
        </section>

        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            手動仕訳の登録・一覧
          </h3>
          <CompetitionBalanceSheetPanel
            competitionId={competition.id}
            initialLines={balanceLineDtos}
          />
        </div>
      </CardContent>
    </Card>
  );
}
