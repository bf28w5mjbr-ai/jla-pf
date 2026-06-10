import { Fragment, Suspense } from "react";
import type { CompetitionStripeSettlementAccountType } from "@prisma/client";
import { prisma } from "@/server/db";
import { getPlatformFeeBps } from "@/lib/platformFee";
import { loadCompetitionFinanceCompactSummaries } from "@/lib/organizationBusinessPanelFinance";
import { CompetitionStripeSettlementSelect } from "@/components/CompetitionStripeSettlementSelect";
import BusinessPanelExpandedFinanceLoader from "@/components/admin/BusinessPanelExpandedFinanceLoader";
import { BusinessPanelFinanceExpandToggle } from "@/components/admin/BusinessPanelFinanceExpandToggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarRange, Info, LayoutDashboard, Wallet } from "lucide-react";

type Props = {
  organizationId: string;
  isOrgAdmin: boolean;
  expandedFinanceCompetitionId?: string | null;
};

const formatYen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

function statusLabelJa(status: string) {
  switch (status) {
    case "DRAFT":
      return "下書き";
    case "PUBLISHED":
      return "公開中";
    case "ONGOING":
      return "開催中";
    case "COMPLETED":
      return "終了";
    case "CANCELLED":
      return "中止";
    default:
      return status;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "PUBLISHED":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "DRAFT":
      return "border-border bg-muted text-muted-foreground";
    case "ONGOING":
      return "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300";
    case "COMPLETED":
      return "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300";
    case "CANCELLED":
      return "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function stripeSettlementShortLabelJa(t: CompetitionStripeSettlementAccountType) {
  return t === "PLATFORM" ? "プラットフォーム" : "主催団体（Connect）";
}

function StatBox({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-border/80 bg-background/80 px-3 py-2 shadow-sm ${className ?? ""}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function CompactFinanceMetrics({
  entryIncomeNetYen,
  platformFeeYen,
  netAfterPaidExpenses,
  platformFeePercentLabel,
}: {
  entryIncomeNetYen: number;
  platformFeeYen: number;
  netAfterPaidExpenses: number;
  platformFeePercentLabel: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <div>
        <p className="text-[10px] font-medium text-muted-foreground">収入</p>
        <p className="text-xs font-semibold tabular-nums">{formatYen(entryIncomeNetYen)}</p>
      </div>
      <div>
        <p className="text-[10px] font-medium text-muted-foreground">PF {platformFeePercentLabel}%</p>
        <p className="text-xs font-semibold tabular-nums">{formatYen(platformFeeYen)}</p>
      </div>
      <div>
        <p className="text-[10px] font-medium text-muted-foreground">差引</p>
        <p className="text-xs font-semibold tabular-nums text-primary">{formatYen(netAfterPaidExpenses)}</p>
      </div>
    </div>
  );
}

export default async function OrganizationBusinessPanelTabContent({
  organizationId,
  isOrgAdmin,
  expandedFinanceCompetitionId = null,
}: Props) {
  const competitions = await prisma.competition.findMany({
    where: { organizationId },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      stripeSettlementAccountType: true,
    },
  });

  const ids = competitions.map((c) => c.id);
  const validExpandedId =
    expandedFinanceCompetitionId && ids.includes(expandedFinanceCompetitionId)
      ? expandedFinanceCompetitionId
      : null;

  const paidMap = new Map<string, number>();
  const manualMap = new Map<string, { income: number; expense: number }>();
  let financeSummaryMap = new Map<
    string,
    {
      entryIncomeNetYen: number;
      platformFeeYen: number;
      netAfterPaidExpenses: number;
    }
  >();

  if (ids.length > 0 && isOrgAdmin) {
    const [paidExpenses, balanceGroups, loadedFinanceSummaries] = await Promise.all([
      prisma.expense.groupBy({
        by: ["ownerId"],
        where: {
          ownerType: "COMPETITION",
          ownerId: { in: ids },
          status: "PAID",
        },
        _sum: { totalAmount: true },
      }),
      prisma.competitionBalanceLine.groupBy({
        by: ["competitionId", "kind"],
        where: { competitionId: { in: ids } },
        _sum: { amount: true },
      }),
      loadCompetitionFinanceCompactSummaries(ids),
    ]);

    financeSummaryMap = loadedFinanceSummaries;

    for (const row of paidExpenses) {
      paidMap.set(row.ownerId, row._sum.totalAmount ?? 0);
    }
    for (const row of balanceGroups) {
      const cur = manualMap.get(row.competitionId) ?? { income: 0, expense: 0 };
      if (row.kind === "INCOME") cur.income += row._sum.amount ?? 0;
      else cur.expense += row._sum.amount ?? 0;
      manualMap.set(row.competitionId, cur);
    }
  }

  const platformFeePercentLabel = (getPlatformFeeBps() / 100).toFixed(
    getPlatformFeeBps() % 100 === 0 ? 0 : 1
  );

  let totalPaidExpenses = 0;
  let totalManualNet = 0;
  let totalNetAfterPaidExpenses = 0;
  for (const c of competitions) {
    totalPaidExpenses += paidMap.get(c.id) ?? 0;
    const manual = manualMap.get(c.id);
    totalManualNet += manual ? manual.income - manual.expense : 0;
    totalNetAfterPaidExpenses += financeSummaryMap.get(c.id)?.netAfterPaidExpenses ?? 0;
  }

  if (competitions.length === 0) {
    return (
      <Card className="overflow-hidden border-dashed">
        <CardHeader className="border-b border-border bg-muted/20 pb-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LayoutDashboard className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">事業パネル</CardTitle>
              <CardDescription className="text-pretty">
                大会ごとの Stripe 集計・手動仕訳・決済口座をここで管理します。
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <CalendarRange className="h-7 w-7" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium text-foreground">大会がまだありません</p>
            <p className="text-sm text-muted-foreground">
              「大会管理」タブで大会を作成すると、ここに一覧と収支が表示されます。
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const adminColCount = 8;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 border-b border-border bg-muted/25 pb-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-lg">事業パネル</CardTitle>
            <CardDescription className="text-pretty leading-relaxed">
              大会ごとの収支サマリを一覧表示します。「収支」を開くと詳細・手動仕訳・紛争対応ができます（1大会ずつ読み込み）。
            </CardDescription>
          </div>
        </div>

        {isOrgAdmin ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatBox label="対象大会" value={`${competitions.length}件`} />
            <StatBox label="差引合計" value={formatYen(totalNetAfterPaidExpenses)} />
            <StatBox label="経費（支払済）" value={formatYen(totalPaidExpenses)} />
            <StatBox label="手動仕訳差額" value={formatYen(totalManualNet)} className="col-span-2 sm:col-span-1" />
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3 p-3 sm:p-4">
        {isOrgAdmin ? (
          <div
            className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
            role="note"
          >
            <p className="font-medium text-foreground">有料エントリーの決済口座（大会ごと）</p>
            <p className="mt-1 leading-relaxed">
              「プラットフォーム」は Connect 審査前でも有料エントリー可。Connect 有効時は主催団体口座へ送金されます。
            </p>
          </div>
        ) : null}

        {!isOrgAdmin ? (
          <div
            className="flex gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground"
            role="note"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 leading-snug">
              金額の列は主催団体の管理者のみ表示されます。
            </p>
          </div>
        ) : null}

        <ul className="flex flex-col gap-2 md:hidden">
          {competitions.map((c) => {
            const start = c.startDate.toISOString().slice(0, 10);
            const end = c.endDate.toISOString().slice(0, 10);
            const finance = financeSummaryMap.get(c.id);
            const isExpanded = validExpandedId === c.id;

            return (
              <li
                key={c.id}
                className="rounded-xl border border-border bg-card shadow-sm"
              >
                <div className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug text-foreground">{c.name}</p>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {start} 〜 {end}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(c.status)}`}
                    >
                      {statusLabelJa(c.status)}
                    </span>
                  </div>

                  {isOrgAdmin && finance ? (
                    <div className="mt-3 border-t border-border/80 pt-3">
                      <CompactFinanceMetrics
                        {...finance}
                        platformFeePercentLabel={platformFeePercentLabel}
                      />
                    </div>
                  ) : null}

                  <div className={`mt-3 space-y-1.5 ${isOrgAdmin ? "border-t border-border/80 pt-3" : ""}`}>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      決済口座
                    </p>
                    {isOrgAdmin ? (
                      <CompetitionStripeSettlementSelect
                        organizationId={organizationId}
                        competitionId={c.id}
                        initialValue={c.stripeSettlementAccountType}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {stripeSettlementShortLabelJa(c.stripeSettlementAccountType)}
                      </p>
                    )}
                  </div>

                  {isOrgAdmin ? (
                    <BusinessPanelFinanceExpandToggle
                      organizationId={organizationId}
                      competitionId={c.id}
                      isExpanded={isExpanded}
                      className="mt-3 h-8 w-full gap-1"
                    />
                  ) : null}
                </div>

                {isExpanded ? (
                  <div className="border-t border-border/80 bg-muted/10 p-3">
                    <Suspense
                      fallback={
                        <p className="py-4 text-center text-xs text-muted-foreground">収支を読み込み中…</p>
                      }
                    >
                      <BusinessPanelExpandedFinanceLoader
                        organizationId={organizationId}
                        competitionId={c.id}
                        isOrgAdmin={isOrgAdmin}
                      />
                    </Suspense>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-hidden rounded-xl border border-border md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    大会
                  </th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    期間
                  </th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    状態
                  </th>
                  {isOrgAdmin ? (
                    <>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        収入
                      </th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        PF
                      </th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        差引
                      </th>
                    </>
                  ) : null}
                  <th className="whitespace-nowrap px-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    決済口座
                  </th>
                  {isOrgAdmin ? (
                    <th className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      操作
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {competitions.map((c) => {
                  const start = c.startDate.toISOString().slice(0, 10);
                  const end = c.endDate.toISOString().slice(0, 10);
                  const finance = financeSummaryMap.get(c.id);
                  const isExpanded = validExpandedId === c.id;

                  return (
                    <Fragment key={c.id}>
                      <tr className="border-b border-border/60 transition-colors hover:bg-muted/25">
                        <td className="max-w-[200px] px-3 py-2 align-middle">
                          <span className="line-clamp-2 text-sm font-medium leading-snug">{c.name}</span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 align-middle text-xs tabular-nums text-muted-foreground">
                          {start}
                          <span className="mx-1 text-border">—</span>
                          {end}
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(c.status)}`}
                          >
                            {statusLabelJa(c.status)}
                          </span>
                        </td>
                        {isOrgAdmin && finance ? (
                          <>
                            <td className="whitespace-nowrap px-2 py-2 text-right align-middle text-sm tabular-nums">
                              {formatYen(finance.entryIncomeNetYen)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right align-middle text-sm tabular-nums">
                              {formatYen(finance.platformFeeYen)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right align-middle text-sm font-medium tabular-nums text-primary">
                              {formatYen(finance.netAfterPaidExpenses)}
                            </td>
                          </>
                        ) : isOrgAdmin ? (
                          <>
                            <td className="px-2 py-2 text-right text-sm text-muted-foreground">—</td>
                            <td className="px-2 py-2 text-right text-sm text-muted-foreground">—</td>
                            <td className="px-2 py-2 text-right text-sm text-muted-foreground">—</td>
                          </>
                        ) : null}
                        <td className="px-2 py-1.5 align-middle">
                          {isOrgAdmin ? (
                            <CompetitionStripeSettlementSelect
                              organizationId={organizationId}
                              competitionId={c.id}
                              initialValue={c.stripeSettlementAccountType}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {stripeSettlementShortLabelJa(c.stripeSettlementAccountType)}
                            </span>
                          )}
                        </td>
                        {isOrgAdmin ? (
                          <td className="px-3 py-1.5 align-middle">
                            <BusinessPanelFinanceExpandToggle
                              organizationId={organizationId}
                              competitionId={c.id}
                              isExpanded={isExpanded}
                              className="h-8 gap-1 px-3"
                            />
                          </td>
                        ) : null}
                      </tr>
                      {isExpanded ? (
                        <tr className="border-b border-border/60 bg-muted/10">
                          <td colSpan={adminColCount} className="p-3">
                            <p className="mb-2 text-xs font-medium text-foreground">{c.name} — 収支詳細</p>
                            <Suspense
                              fallback={
                                <p className="py-4 text-center text-xs text-muted-foreground">
                                  収支を読み込み中…
                                </p>
                              }
                            >
                              <BusinessPanelExpandedFinanceLoader
                                organizationId={organizationId}
                                competitionId={c.id}
                                isOrgAdmin={isOrgAdmin}
                              />
                            </Suspense>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
