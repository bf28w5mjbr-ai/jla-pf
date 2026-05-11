"use client";

import Link from "next/link";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Droplets,
  ExternalLink,
  FileText,
  History,
  ListOrdered,
  UserCog,
  UsersRound,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { appRoutes } from "@/lib/appRoutes";
import { cn } from "@/lib/utils";
import { getTeamPaymentStatusLabel } from "@/lib/teamEntryPayments";
import { formatTeamNamesCompactByClubPrefix } from "@/lib/teamEntryHistoryDisplay";

const sexLabel = (sex?: string | null) => {
  if (sex === "MALE") return "男子";
  if (sex === "FEMALE") return "女子";
  return "その他";
};

type ClubRow = { id: string; name: string };
/** 年齢区分の表示順（大会の CompetitionAgeCategory）。未紐付けは null（一覧では末尾に寄せる） */
type EventRow = {
  id: string;
  name: string;
  sex: string | null;
  category: string;
  displayOrder: number;
  ageCategoryDisplayOrder: number | null;
};
type TeamEntryRow = {
  id: string;
  clubId: string;
  eventId: string;
  teamName: string;
  updatedAt: Date;
};

type TeamEntryEventGroup = { eventId: string; entries: TeamEntryRow[] };

/** `sortedForClub` の並びを保ったまま、同一種目を1グループにまとめる */
function groupRowsByEventId(sortedRows: TeamEntryRow[]): TeamEntryEventGroup[] {
  const out: TeamEntryEventGroup[] = [];
  for (const row of sortedRows) {
    const tail = out[out.length - 1];
    if (tail?.eventId === row.eventId) {
      tail.entries.push(row);
    } else {
      out.push({ eventId: row.eventId, entries: [row] });
    }
  }
  return out;
}

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

/** POOL → OCEAN、同一大会内では年齢区分でまとめ、その中で種目 displayOrder */
function compareEventsForHistory(a: EventRow | undefined, b: EventRow | undefined): number {
  const key = (e: EventRow | undefined): [number, number, number, string, string] => {
    if (!e) return [9, 999_999, 999_999, "\uffff", ""];
    const poolOcean = e.category === "OCEAN" ? 1 : 0;
    const ageOrd = e.ageCategoryDisplayOrder ?? 999_999;
    const disp = e.displayOrder ?? 0;
    return [poolOcean, ageOrd, disp, e.name, e.id];
  };
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < ka.length; i++) {
    const va = ka[i];
    const vb = kb[i];
    if (typeof va === "number" && typeof vb === "number") {
      if (va !== vb) return va - vb;
    } else if (va !== vb) {
      return String(va).localeCompare(String(vb), "ja");
    }
  }
  return 0;
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

  const sortedForClub = (clubId: string) =>
    teamEntries
      .filter((t) => t.clubId === clubId)
      .sort((a, b) => {
        const evA = eventById.get(a.eventId);
        const evB = eventById.get(b.eventId);
        const byEvent = compareEventsForHistory(evA, evB);
        if (byEvent !== 0) return byEvent;
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
              {viewOnly ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  エントリー受付終了後の登録内容です。変更はできません。
                </p>
              ) : null}
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <UsersRound className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  <span>登録チーム計 {totalTeams} 組</span>
                </span>
              </p>
            </div>
          </div>
          <div className="flex w-full min-w-0 shrink-0 flex-col gap-2.5 self-start sm:w-auto sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {clubsWithEntries.map((club) => (
                <Button
                  key={club.id}
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-9 w-full justify-start gap-2 px-3 py-2 text-xs sm:w-auto sm:justify-center"
                  asChild
                >
                  <Link
                    href={appRoutes.clubs.competition.team(club.id, competitionId, {
                      tab: "assignment",
                    })}
                    title={`${club.name} のメンバー割当`}
                    aria-label={`${club.name} のメンバー割当ページへ`}
                    className="inline-flex min-w-0 items-start gap-2 text-left sm:items-center"
                  >
                    <UserCog className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground sm:mt-0" aria-hidden />
                    <span className="inline-flex min-w-0 flex-col items-start gap-0.5 leading-tight">
                      <span className="font-medium">メンバー割当</span>
                      {clubsWithEntries.length > 1 ? (
                        <span className="max-w-[14rem] truncate font-normal text-muted-foreground">
                          {club.name}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </Button>
              ))}
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/90 px-3 py-2 text-sm shadow-sm ring-1 ring-border/40 sm:shrink-0">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <span className="font-semibold leading-tight text-foreground">
                  {isFree ? "登録済み（無料）" : "登録済み"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <div className="space-y-4">
          {clubsWithEntries.map((club) => {
            const rows = sortedForClub(club.id);
            const rowGroups = groupRowsByEventId(rows);
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

                <details className="group border-t border-border/40 bg-muted/10">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden hover:bg-muted/40 sm:px-4">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span>種目・チーム一覧</span>
                      <span className="tabular-nums text-muted-foreground">{rows.length} 組</span>
                    </span>
                    <ChevronDown
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <div className="overflow-x-auto border-t border-border/40 bg-background/40">
                    <table className="w-full min-w-[240px] text-xs leading-tight">
                      <thead>
                        <tr className="sr-only">
                          <th scope="col">種目</th>
                          <th scope="col">チーム名</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowGroups.map((group) => {
                          const ev = eventById.get(group.eventId);
                          const teamNames = group.entries.map((e) => e.teamName);
                          const { display: teamDisplay, title: teamTitle } =
                            formatTeamNamesCompactByClubPrefix(club.name, teamNames);
                          return (
                            <tr
                              key={`${club.id}-${group.eventId}`}
                              className="border-b border-border/30 transition-colors last:border-0 hover:bg-muted/30"
                            >
                              <td className="px-2 py-1.5 align-top sm:px-3 sm:py-2">
                                <div className="flex gap-2">
                                  <CategoryGlyph category={ev?.category ?? "POOL"} />
                                  <span className="min-w-0 leading-snug text-foreground">
                                    {formatEventLabel(ev)}
                                  </span>
                                </div>
                              </td>
                              <td className="min-w-0 px-2 py-1.5 pr-2 align-top font-medium text-foreground sm:px-3 sm:py-2 sm:pr-3">
                                <span className="break-words" title={teamTitle}>
                                  {teamDisplay}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>

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
      </CardContent>
    </Card>
  );
}
