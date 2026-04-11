import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/server/db";
import { buildTeamEntryPaymentOwnerId } from "@/lib/teamEntryPayments";
import { CompetitionBalanceSheetPanel } from "@/components/admin/CompetitionBalanceSheetPanel";

type Props = {
  organizationId: string;
  competitionId: string;
  canEdit: boolean;
};

const formatYen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

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
        checkoutSessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true },
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

  let individualReceived = 0;
  let individualPending = 0;
  for (const e of entries) {
    if (e.status === "CANCELLED") continue;
    if (e.totalFee <= 0) continue;
    const completed = e.checkoutSessions[0]?.status === "COMPLETED";
    if (completed) individualReceived += e.totalFee;
    else individualPending += e.totalFee;
  }

  const clubIds = [...new Set(teamEntries.map((t) => t.clubId))];
  const teamOwnerIds = clubIds.map((cid) =>
    buildTeamEntryPaymentOwnerId(competition.id, cid)
  );
  const teamPayments =
    teamOwnerIds.length > 0
      ? await prisma.payment.findMany({
          where: {
            ownerType: "CLUB",
            ownerId: { in: teamOwnerIds },
            type: "COMPETITION_ENTRY_FEE",
          },
          select: { ownerId: true, status: true, amount: true },
        })
      : [];

  let teamReceived = 0;
  let teamPending = 0;
  for (const p of teamPayments) {
    if (p.status === "SUCCEEDED") {
      teamReceived += p.amount;
    } else if (p.status === "PENDING") {
      teamPending += p.amount;
    }
  }

  const clubsWithTeamEntryButNoSucceededPayment = clubIds.filter((cid) => {
    const oid = buildTeamEntryPaymentOwnerId(competition.id, cid);
    const pay = teamPayments.find((x) => x.ownerId === oid);
    return !pay || pay.status !== "SUCCEEDED";
  }).length;

  const expensePaidTotal = expenses
    .filter((x) => x.status === "PAID")
    .reduce((s, x) => s + x.totalAmount, 0);
  const expenseApprovedUnpaid = expenses
    .filter((x) => x.status === "APPROVED")
    .reduce((s, x) => s + x.totalAmount, 0);

  const totalRevenue = individualReceived + teamReceived;
  const netAfterPaidExpenses = totalRevenue - expensePaidTotal;

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

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="space-y-1 border-b border-border bg-muted/30 py-3">
        <CardTitle className="text-base">事業収支</CardTitle>
        <p className="text-xs text-muted-foreground">{competition.name}</p>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 p-3 sm:p-4">
        <section aria-labelledby="finance-auto-heading">
          <h3 id="finance-auto-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            自動集計（エントリー・経費ワークフロー）
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Stat label="個人（決済済）" value={formatYen(individualReceived)} />
            <Stat label="個人（未決済）" value={formatYen(individualPending)} />
            <Stat
              label="チーム（入金済）"
              value={formatYen(teamReceived)}
              sub={teamSubParts.length > 0 ? teamSubParts.join(" · ") : undefined}
            />
            <Stat label="収入計（確定）" value={formatYen(totalRevenue)} />
            <Stat
              label="経費（支払済）"
              value={formatYen(expensePaidTotal)}
              sub={
                expenseApprovedUnpaid > 0
                  ? `承認済未払 ${formatYen(expenseApprovedUnpaid)}`
                  : undefined
              }
            />
            <Stat
              label="差引"
              value={formatYen(netAfterPaidExpenses)}
              valueClassName="text-primary"
            />
          </div>
        </section>

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
