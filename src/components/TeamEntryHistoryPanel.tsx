import Link from "next/link";
import { appRoutes } from "@/lib/appRoutes";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Droplets,
  ExternalLink,
  FileText,
  History,
  ListOrdered,
  UsersRound,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getTeamPaymentStatusLabel } from "@/lib/teamEntryPayments";

const sexLabel = (sex?: string | null) => {
  if (sex === "MALE") return "男子";
  if (sex === "FEMALE") return "女子";
  return "その他";
};

type ClubRow = { id: string; name: string };
type EventRow = { id: string; name: string; sex: string | null; category: string };
type TeamEntryRow = {
  id: string;
  clubId: string;
  eventId: string;
  teamName: string;
  updatedAt: Date;
};

type BillingSlice = {
  id?: string;
  status: string;
  amount: number;
  finalizedAt: string | null;
  stripeCheckoutSessionId?: string | null;
} | undefined;

type Props = {
  competitionId: string;
  competitionName: string;
  teamEntryFeePerTeam: number;
  clubs: ClubRow[];
  events: EventRow[];
  teamEntries: TeamEntryRow[];
  billingByClub: Record<string, BillingSlice>;
  /** エントリー締切後は閲覧のみ（編集フォームなし） */
  viewOnly?: boolean;
};

function formatEventLabel(event: EventRow | undefined) {
  if (!event) return "種目不明";
  return `${event.name}（${sexLabel(event.sex)}）`;
}

/** `CompetitionTeamEntryManager` の請求バッジとトーンを揃える */
function paymentBadgeClass(status: string | undefined, isFree: boolean) {
  if (isFree) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100";
  }
  switch (status) {
    case "SUCCEEDED":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100";
    case "REFUNDED":
      return "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200";
    case "FAILED":
    case "EXPIRED":
      return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
    case "DISPUTED":
      return "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100";
    case "PENDING":
    default:
      return "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100";
  }
}

function CategoryGlyph({ category }: { category: string }) {
  if (category === "OCEAN") {
    return (
      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-200"
        title="オーシャン"
      >
        <Waves className="h-3.5 w-3.5" aria-hidden />
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200"
      title="プール"
    >
      <Droplets className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

export default function TeamEntryHistoryPanel({
  competitionId,
  competitionName,
  teamEntryFeePerTeam,
  clubs,
  events,
  teamEntries,
  billingByClub,
  viewOnly = false,
}: Props) {
  if (teamEntries.length === 0) {
    return null;
  }

  const isFree = teamEntryFeePerTeam <= 0;
  const eventById = new Map(events.map((e) => [e.id, e]));
  const eventOrder = new Map(events.map((e, i) => [e.id, i]));

  const sortedForClub = (clubId: string) =>
    teamEntries
      .filter((t) => t.clubId === clubId)
      .sort((a, b) => {
        const oa = eventOrder.get(a.eventId) ?? 999;
        const ob = eventOrder.get(b.eventId) ?? 999;
        if (oa !== ob) return oa - ob;
        return a.teamName.localeCompare(b.teamName, "ja");
      });

  const clubsWithEntries = clubs.filter((c) => teamEntries.some((t) => t.clubId === c.id));

  const lastUpdatedForClub = (clubId: string) => {
    const times = teamEntries.filter((t) => t.clubId === clubId).map((t) => t.updatedAt.getTime());
    return times.length ? new Date(Math.max(...times)) : null;
  };

  const totalTeams = teamEntries.length;

  return (
    <Card padding="none" className="border-border/80 shadow-sm">
      <div className="border-b border-border/60 bg-gradient-to-b from-muted/50 via-muted/25 to-transparent px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15">
              <ClipboardList className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  エントリー履歴
                </p>
              </div>
              <p className="text-base font-semibold leading-snug text-foreground">{competitionName}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {viewOnly
                  ? "エントリー受付終了後の登録内容です。変更はできません。"
                  : "保存済みのチーム登録です。変更は下の「登録内容の編集」から行えます。"}
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <UsersRound className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  <span>登録チーム計 {totalTeams} 組</span>
                </span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-border/70 bg-background/90 px-3 py-2.5 text-sm shadow-sm ring-1 ring-border/40 sm:max-w-[14rem]">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold leading-tight text-foreground">
              {isFree ? "登録済み（無料）" : "登録済み"}
            </span>
          </div>
        </div>
      </div>

      <CardContent className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <div className="space-y-4">
          {clubsWithEntries.map((club) => {
            const rows = sortedForClub(club.id);
            const billing = billingByClub[club.id];
            const lastUp = lastUpdatedForClub(club.id);
            const paymentLabel = isFree ? "決済不要" : getTeamPaymentStatusLabel(billing?.status);
            const canPdf = isFree || billing?.status === "SUCCEEDED";
            const canStripe =
              !isFree && billing?.status === "SUCCEEDED" && (billing.amount ?? 0) > 0;

            return (
              <div
                key={club.id}
                className="overflow-hidden rounded-xl border border-border/70 bg-muted/15 shadow-[inset_0_1px_0_0_hsl(var(--border)/0.35)] dark:bg-muted/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 bg-background/50 px-3 py-3 sm:px-4">
                  <div className="flex min-w-0 gap-2.5">
                    <Building2
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{club.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {lastUp ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3.5 w-3.5 opacity-70" aria-hidden />
                            最終更新 {lastUp.toLocaleString("ja-JP")}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <ListOrdered className="h-3.5 w-3.5 opacity-70" aria-hidden />
                          {rows.length} 組
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 font-normal", paymentBadgeClass(billing?.status, isFree))}
                  >
                    {paymentLabel}
                  </Badge>
                </div>

                {!isFree && typeof billing?.amount === "number" ? (
                  <p className="border-b border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground sm:px-4">
                    請求額{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      ¥{billing.amount.toLocaleString("ja-JP")}
                    </span>
                    {billing.finalizedAt ? (
                      <span className="ml-2">
                        （請求確定: {new Date(billing.finalizedAt).toLocaleString("ja-JP")}）
                      </span>
                    ) : null}
                  </p>
                ) : null}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[280px] text-sm">
                    <thead>
                      <tr className="border-b border-border/40 bg-muted/25 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 sm:px-4">種目</th>
                        <th className="px-3 py-2 pr-4 sm:px-4">チーム名</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const ev = eventById.get(row.eventId);
                        return (
                          <tr
                            key={row.id}
                            className="border-b border-border/30 transition-colors last:border-0 hover:bg-muted/30"
                          >
                            <td className="px-3 py-2.5 align-top sm:px-4">
                              <div className="flex gap-2.5">
                                <CategoryGlyph category={ev?.category ?? "POOL"} />
                                <span className="min-w-0 leading-snug text-foreground">
                                  {formatEventLabel(ev)}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 pr-4 align-top font-medium text-foreground sm:px-4">
                              {row.teamName}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {canPdf ? (
                  <div className="flex flex-wrap gap-2 border-t border-border/40 bg-muted/10 px-3 py-3 sm:px-4">
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" asChild>
                      <a
                        href={`/api/competitions/${competitionId}/team-billing/receipt?clubId=${encodeURIComponent(club.id)}&format=pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden />
                        領収書（PDF）
                      </a>
                    </Button>
                    {canStripe ? (
                      <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" asChild>
                        <a
                          href={`/api/competitions/${competitionId}/team-billing/receipt?clubId=${encodeURIComponent(club.id)}&format=stripe`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          領収書（Stripe）
                        </a>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 border-t border-border/50 pt-5 sm:flex-row sm:flex-wrap sm:items-center">
          <Button variant="default" className="h-10 w-full gap-2 text-sm sm:h-9 sm:w-auto" asChild>
            <Link href={appRoutes.competitions.root(competitionId)}>
              <ArrowLeft className="h-4 w-4" />
              大会ページへ戻る
            </Link>
          </Button>
          <Button variant="outline" className="h-10 w-full text-sm sm:h-9 sm:w-auto" asChild>
            <Link href={appRoutes.me.entries()}>個人エントリー履歴</Link>
          </Button>
        </div>

        <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {viewOnly ? (
            <>
              個人種目の申込状況は「個人エントリー履歴」で確認できます。無料または決済完了後に、上の領収書（PDF）を発行できます。
            </>
          ) : (
            <>
              個人種目の申込状況は「個人エントリー履歴」で確認できます。チーム種目の編集はこのページ下部のフォームから行ってください。
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
