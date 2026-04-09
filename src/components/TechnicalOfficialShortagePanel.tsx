import Link from "next/link";
import { appRoutes } from "@/lib/appRoutes";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TechnicalOfficialShortageRow } from "@/lib/technicalOfficialQueries";

export default function TechnicalOfficialShortagePanel({
  rows,
}: {
  rows: TechnicalOfficialShortageRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <Card className="overflow-hidden border-amber-500/40 bg-gradient-to-br from-amber-500/[0.09] via-amber-500/[0.04] to-transparent shadow-sm ring-1 ring-amber-500/20 dark:from-amber-950/40 dark:ring-amber-900/30">
      <CardHeader className="space-y-1.5 border-b border-amber-500/25 pb-3 dark:border-amber-900/40">
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800 shadow-sm dark:bg-amber-400/10 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          テクニカルオフィシャル不足のクラブ
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          個人エントリー合計の閾値に対し、承認済みの任命が足りないクラブのみです（チーム種目の件数は含みません）。クラブ詳細の「参加大会」から招待・承認できます。
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.clubId}
              className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/90 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full justify-between gap-2 border-border/80 font-medium sm:w-fit sm:min-w-[12rem]"
                asChild
              >
                <Link href={appRoutes.clubs.root(r.clubId)} className="gap-2">
                  <span className="truncate">{r.clubName}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                </Link>
              </Button>
              <div className="grid grid-cols-2 gap-2 text-center sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-4 sm:text-right">
                <div className="rounded-lg bg-muted/50 px-2 py-1.5 sm:bg-transparent sm:p-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">個人エントリー合計</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">{r.entryCount} 件</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-2 py-1.5 sm:bg-transparent sm:p-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">必要 / 充足</p>
                  <p className="text-sm font-medium tabular-nums text-foreground">
                    {r.required} / {r.assigned}
                  </p>
                </div>
                <div className="col-span-2 rounded-lg border border-amber-500/35 bg-amber-500/[0.08] px-2 py-1.5 sm:col-span-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-amber-900 dark:text-amber-100">
                    不足
                  </p>
                  <p className="text-sm font-bold tabular-nums text-amber-950 dark:text-amber-50">
                    {r.shortage} 人
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
