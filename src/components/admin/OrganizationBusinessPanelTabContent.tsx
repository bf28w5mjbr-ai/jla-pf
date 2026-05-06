import Link from "next/link";
import type { CompetitionStripeSettlementAccountType } from "@prisma/client";
import { prisma } from "@/server/db";
import { CompetitionStripeSettlementSelect } from "@/components/CompetitionStripeSettlementSelect";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarRange, ChevronRight, Info, LayoutDashboard, Wallet } from "lucide-react";

type Props = {
  organizationId: string;
  isOrgAdmin: boolean;
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

export default async function OrganizationBusinessPanelTabContent({
  organizationId,
  isOrgAdmin,
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

  const paidMap = new Map<string, number>();
  const manualMap = new Map<string, { income: number; expense: number }>();

  if (ids.length > 0 && isOrgAdmin) {
    const [paidExpenses, balanceGroups] = await Promise.all([
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
    ]);

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

  let totalPaidExpenses = 0;
  let totalManualNet = 0;
  for (const c of competitions) {
    totalPaidExpenses += paidMap.get(c.id) ?? 0;
    const manual = manualMap.get(c.id);
    totalManualNet += manual ? manual.income - manual.expense : 0;
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
                大会ごとの経費・手動仕訳の概要と、各大会の事業収支へのショートカットです。
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
              「大会管理」タブで大会を作成すると、ここに一覧と収支の導線が表示されます。
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-4 border-b border-border bg-muted/25 pb-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-lg">事業パネル</CardTitle>
            <CardDescription className="text-pretty leading-relaxed">
              経費（支払済）と手動仕訳は大会単位の集計です。エントリー収入などの詳細は各大会の「事業収支」を開いてください。
            </CardDescription>
          </div>
        </div>

        {isOrgAdmin ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatBox label="対象大会" value={`${competitions.length}件`} />
            <StatBox label="経費（支払済）合計" value={formatYen(totalPaidExpenses)} />
            <StatBox
              label="手動仕訳差額 合計"
              value={formatYen(totalManualNet)}
              className="col-span-2 sm:col-span-1"
            />
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-6">
        {isOrgAdmin ? (
          <div
            className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground"
            role="note"
          >
            <p className="font-medium text-foreground">有料エントリーの決済口座（大会ごと）</p>
            <p className="mt-1.5 leading-relaxed">
              「プラットフォーム」を選ぶと、Stripe Connect の審査が未完でも有料エントリーを受け付けられます。
              Connect が有効な団体では、売上は従来どおり主催団体アカウントへ送金されます。
              Connect 未整備の間だけ、売上がプラットフォーム口座側に載ります。
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
              金額の列は主催団体の管理者のみ表示されます。下のボタンから各大会の管理画面（事業収支タブ）へ進めます。
            </p>
          </div>
        ) : null}

        {/* モバイル: カード一覧 */}
        <ul className="flex flex-col gap-3 md:hidden">
          {competitions.map((c) => {
            const start = c.startDate.toISOString().slice(0, 10);
            const end = c.endDate.toISOString().slice(0, 10);
            const paid = paidMap.get(c.id) ?? 0;
            const manual = manualMap.get(c.id);
            const manualNet = manual ? manual.income - manual.expense : 0;
            const financeHref = `/organizations/${organizationId}/competitions/${c.id}?tab=finance`;

            return (
              <li
                key={c.id}
                className="rounded-xl border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
              >
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
                {isOrgAdmin ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/80 pt-3">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        経費（支払済）
                      </p>
                      <p className="text-sm font-semibold tabular-nums">{formatYen(paid)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        手動仕訳差額
                      </p>
                      <p className="text-sm font-semibold tabular-nums">{formatYen(manualNet)}</p>
                    </div>
                  </div>
                ) : null}
                <div className={`mt-3 space-y-1.5 ${isOrgAdmin ? "border-t border-border/80 pt-3" : ""}`}>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    決済口座（有料エントリー）
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
                <Button asChild variant="secondary" size="sm" className="mt-3 h-9 w-full gap-1 font-medium">
                  <Link href={financeHref}>
                    事業収支を開く
                    <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>

        {/* デスクトップ: 表 */}
        <div className="hidden overflow-hidden rounded-xl border border-border md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    大会
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    期間
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    状態
                  </th>
                  {isOrgAdmin ? (
                    <>
                      <th className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        経費（支払済）
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        手動仕訳差額
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        決済口座
                      </th>
                    </>
                  ) : (
                    <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      決済口座
                    </th>
                  )}
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {competitions.map((c) => {
                  const start = c.startDate.toISOString().slice(0, 10);
                  const end = c.endDate.toISOString().slice(0, 10);
                  const paid = paidMap.get(c.id) ?? 0;
                  const manual = manualMap.get(c.id);
                  const manualNet = manual ? manual.income - manual.expense : 0;
                  const financeHref = `/organizations/${organizationId}/competitions/${c.id}?tab=finance`;

                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/25"
                    >
                      <td className="max-w-[240px] px-4 py-3 align-middle">
                        <span className="line-clamp-2 text-sm font-medium leading-snug">{c.name}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-middle text-xs tabular-nums text-muted-foreground">
                        {start}
                        <span className="mx-1 text-border">—</span>
                        {end}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(c.status)}`}
                        >
                          {statusLabelJa(c.status)}
                        </span>
                      </td>
                      {isOrgAdmin ? (
                        <>
                          <td className="whitespace-nowrap px-3 py-3 text-right align-middle text-sm tabular-nums">
                            {formatYen(paid)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right align-middle text-sm font-medium tabular-nums">
                            {formatYen(manualNet)}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <CompetitionStripeSettlementSelect
                              organizationId={organizationId}
                              competitionId={c.id}
                              initialValue={c.stripeSettlementAccountType}
                            />
                          </td>
                        </>
                      ) : (
                        <td className="whitespace-nowrap px-3 py-3 align-middle text-xs text-muted-foreground">
                          {stripeSettlementShortLabelJa(c.stripeSettlementAccountType)}
                        </td>
                      )}
                      <td className="px-4 py-2.5 align-middle">
                        <Button asChild variant="outline" size="sm" className="h-8 gap-1 px-3">
                          <Link href={financeHref}>
                            開く
                            <ChevronRight className="h-3.5 w-3.5 opacity-70" aria-hidden />
                          </Link>
                        </Button>
                      </td>
                    </tr>
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
