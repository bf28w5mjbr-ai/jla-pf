import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  History,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { OrgEditorialPanel, OrgSubheading } from "@/app/(authenticated)/organizations/[id]/_components/organizationEditorialUi";
import { appRoutes } from "@/lib/appRoutes";
import { cn } from "@/lib/utils";
import {
  splitRosterByEntryKind,
  type ClubCompetitionRosterParticipant,
} from "@/lib/clubCompetitionRoster";
import { loadClubCompetitionTabData } from "@/lib/clubCompetitionTabLoader";
import { ClubTechnicalOfficialRowLazy } from "./clubDynamicClients";

function ClubRosterCollapsibleBlock({
  roster,
  listLabel,
}: {
  roster: ClubCompetitionRosterParticipant[];
  listLabel: string;
}) {
  if (roster.length === 0) return null;

  return (
    <details className="group rounded-md border border-border/50 bg-muted/10">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden hover:bg-muted/30">
        <span className="min-w-0 truncate">
          {listLabel}
          <span className="ml-1.5 tabular-nums text-muted-foreground">{roster.length}名</span>
        </span>
        <ChevronDown
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <ul className="max-h-48 space-y-0.5 overflow-y-auto border-t border-border/45 px-2 py-1.5">
        {roster.map((p) => (
          <li
            key={p.userId}
            className="rounded px-1.5 py-1 text-xs leading-snug hover:bg-muted/25"
          >
            <span className="font-medium text-foreground">{p.displayName}</span>
            {p.detailLines.length > 0 ? (
              <span className="text-muted-foreground"> · {p.detailLines.join(" / ")}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function competitionEntryStatusBadge(
  now: Date,
  entryStart: Date | null,
  entryEnd: Date | null
): { label: string; className: string } {
  if (!entryStart || !entryEnd) {
    return {
      label: "期間未設定",
      className: "border-border/80 bg-muted/50 font-normal text-muted-foreground",
    };
  }
  if (now < entryStart) {
    return {
      label: "開始前",
      className:
        "border-amber-300/70 bg-amber-50 font-normal text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100",
    };
  }
  if (now > entryEnd) {
    return {
      label: "終了",
      className: "border-border/80 bg-muted/60 font-normal text-muted-foreground",
    };
  }
  return {
    label: "受付中",
    className:
      "border-emerald-300/70 bg-emerald-50 font-normal text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
  };
}

function teamAssignmentStatusBadge(row: {
  teamCount: number;
  assignmentOpen: boolean;
  allTeamsMarshalBlocked: boolean;
}): { label: string; className: string } | null {
  if (row.teamCount === 0) return null;
  if (row.allTeamsMarshalBlocked) {
    return {
      label: "割当締切",
      className: "border-border/80 bg-muted/60 font-normal text-muted-foreground",
    };
  }
  if (row.assignmentOpen) {
    return {
      label: "割当可",
      className:
        "border-emerald-300/70 bg-emerald-50 font-normal text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
    };
  }
  return {
    label: "割当準備",
    className: "border-border/80 bg-muted/50 font-normal text-muted-foreground",
  };
}

function teamAssignmentClosedHint(row: {
  teamCount: number;
  assignmentOpen: boolean;
  allTeamsMarshalBlocked: boolean;
  entryEndDate: Date | null;
}): string | null {
  if (row.teamCount === 0 || row.assignmentOpen) return null;
  if (row.allTeamsMarshalBlocked) return "マーシャル締切のため割当変更不可";
  if (!row.entryEndDate) return null;
  return "エントリー終了後に割当可能";
}

export async function ClubCompetitionsTabPanel({
  clubId,
  clubName,
  isClubAdmin,
}: {
  clubId: string;
  clubName: string;
  isClubAdmin: boolean;
}) {
  const {
    competitionRows,
    competitionTeamSummaries,
    rosterByCompetitionId,
    summaryByCompetitionId,
    technicalOfficialCompetitionIdSet,
    competitionIdsFromToOnly,
  } = await loadClubCompetitionTabData(clubId, clubName);

  const now = new Date();

  return (
    <TabsContent value="competitions" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <OrgSubheading>Competitions</OrgSubheading>
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" asChild>
          <Link href={appRoutes.clubs.entries(clubId)}>
            <History className="size-3.5" aria-hidden />
            提出履歴
          </Link>
        </Button>
      </div>

      <div id="club-team-assignment" className="scroll-mt-24">
        <OrgEditorialPanel accent="orange" className="!px-4 !py-4 sm:!px-5 sm:!py-5">
          {competitionTeamSummaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/15 px-4 py-8 text-center">
              <Trophy className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <p className="text-sm text-muted-foreground">
                {isClubAdmin ? "参加中の大会はまだありません" : "表示できる大会はありません"}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {competitionRows.map(({ competition }) => {
                const row = summaryByCompetitionId.get(competition.id);
                if (!row) return null;

                const fullRoster = rosterByCompetitionId.get(row.id) ?? [];
                const { individual: rosterIndividual, team: rosterTeam } =
                  splitRosterByEntryKind(fullRoster);
                const showTo = technicalOfficialCompetitionIdSet.has(competition.id);
                const entryBadge = competitionEntryStatusBadge(
                  now,
                  competition.entryStartDate ? new Date(competition.entryStartDate) : null,
                  competition.entryEndDate ? new Date(competition.entryEndDate) : null
                );
                const teamAssignBadge = teamAssignmentStatusBadge(row);
                const closedHint = teamAssignmentClosedHint(row);
                const dateLabel = row.startDate.toLocaleDateString("ja-JP", {
                  month: "numeric",
                  day: "numeric",
                });
                const metaParts = [
                  dateLabel,
                  competition.venue?.trim() || null,
                  row.teamCount > 0 ? `チーム${row.teamCount}` : null,
                  rosterIndividual.length > 0 ? `個人${rosterIndividual.length}` : null,
                ].filter(Boolean);

                return (
                  <li
                    key={row.id}
                    className="flex items-start gap-0.5 overflow-hidden rounded-lg border border-border/55 bg-card/60"
                  >
                    <details className="group min-w-0 flex-1">
                      <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden hover:bg-muted/20 sm:items-center">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex min-w-0 items-start gap-1.5 sm:items-center">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                              {row.name}
                            </span>
                            <ChevronDown
                              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 sm:mt-0"
                              aria-hidden
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge
                              variant="outline"
                              className={cn("h-5 px-1 text-[10px] font-normal", entryBadge.className)}
                            >
                              {entryBadge.label}
                            </Badge>
                            {teamAssignBadge ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-5 px-1 text-[10px] font-normal",
                                  teamAssignBadge.className
                                )}
                              >
                                {teamAssignBadge.label}
                              </Badge>
                            ) : null}
                            {metaParts.length > 0 ? (
                              <span className="text-[10px] text-muted-foreground">
                                {metaParts.join(" · ")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </summary>

                      <div className="space-y-2 border-t border-border/45 px-3 py-2.5">
                        {competitionIdsFromToOnly.has(row.id) ? (
                          <p className="text-[11px] text-muted-foreground">
                            TO のみ（競技エントリーなし）
                          </p>
                        ) : null}

                        {rosterIndividual.length > 0 ? (
                          <ClubRosterCollapsibleBlock
                            roster={rosterIndividual}
                            listLabel="個人"
                          />
                        ) : null}

                        {(row.teamCount > 0 || rosterTeam.length > 0 || isClubAdmin) && (
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs text-foreground">
                                チーム{" "}
                                <span className="font-semibold tabular-nums">{row.teamCount}</span>{" "}
                                組
                                {closedHint ? (
                                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                                    ({closedHint})
                                  </span>
                                ) : null}
                              </p>
                              {isClubAdmin ? (
                                <Button variant="default" size="sm" className="h-7 gap-1 px-2 text-xs" asChild>
                                  <Link href={appRoutes.clubs.competition.assignments(clubId, row.id)}>
                                    割当
                                    <ArrowRight className="size-3" aria-hidden />
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
                            {row.teamCount > 0 && row.assignmentDeadline ? (
                              <p className="text-[10px] text-muted-foreground">
                                割当目安: {row.assignmentDeadline.toLocaleDateString("ja-JP")}
                              </p>
                            ) : null}
                            <ClubRosterCollapsibleBlock roster={rosterTeam} listLabel="出場者" />
                          </div>
                        )}

                        {showTo ? (
                          <div className="border-t border-border/40 pt-2">
                            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">TO</p>
                            <ClubTechnicalOfficialRowLazy
                              clubId={clubId}
                              competitionId={row.id}
                              competitionName={row.name}
                              isClubAdmin={isClubAdmin}
                            />
                          </div>
                        ) : null}
                      </div>
                    </details>
                    <Link
                      href={appRoutes.competitions.root(row.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 shrink-0 items-center justify-center px-2 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                      aria-label={`${row.name}の大会ページ`}
                    >
                      <ExternalLink className="size-3.5" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </OrgEditorialPanel>
      </div>
    </TabsContent>
  );
}
