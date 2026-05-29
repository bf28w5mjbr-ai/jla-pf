import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  History,
  MapPin,
  Trophy,
  User,
  UserCog,
  Users,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { appRoutes } from "@/lib/appRoutes";
import { cn } from "@/lib/utils";
import {
  splitRosterByEntryKind,
  type ClubCompetitionRosterParticipant,
} from "@/lib/clubCompetitionRoster";
import { loadClubCompetitionTabData } from "@/lib/clubCompetitionTabLoader";
import { ClubTechnicalOfficialRowLazy } from "./clubDynamicClients";

/** これを超えると一覧は折りたたみ初期表示（ページが縦に伸びすぎないようにする） */
const ROSTER_COLLAPSED_BY_DEFAULT_MIN = 8;

const ROSTER_LIST_SCROLL_CLASS =
  "max-h-[min(45vh,20rem)] space-y-2 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]";

function ClubRosterParticipantList({
  roster,
  className,
}: {
  roster: ClubCompetitionRosterParticipant[];
  className?: string;
}) {
  return (
    <ul className={cn(ROSTER_LIST_SCROLL_CLASS, className)}>
      {roster.map((p) => (
        <li key={p.userId} className="rounded-lg border border-border/50 bg-card/90 px-3 py-2.5 shadow-sm">
          <p className="text-sm font-medium text-foreground">{p.displayName}</p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            {p.detailLines.map((line, idx) => (
              <li key={`${p.userId}-${idx}`}>{line}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function ClubRosterCollapsibleBlock({
  roster,
  listLabel,
}: {
  roster: ClubCompetitionRosterParticipant[];
  listLabel: string;
}) {
  if (roster.length === 0) {
    return null;
  }
  return roster.length > ROSTER_COLLAPSED_BY_DEFAULT_MIN ? (
    <details className="group mt-3 overflow-hidden rounded-lg border border-border/60 bg-background/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden hover:bg-muted/40">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>{listLabel}</span>
          <Badge variant="secondary" className="tabular-nums">
            {roster.length}名
          </Badge>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border/50 bg-muted/10 px-2 pb-2">
        <ClubRosterParticipantList roster={roster} className="px-1 py-3 pr-2" />
      </div>
    </details>
  ) : (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
        <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        {listLabel}
        <Badge variant="secondary" className="tabular-nums">
          {roster.length}名
        </Badge>
      </div>
      <ClubRosterParticipantList roster={roster} className="mt-3 pr-1" />
    </div>
  );
}

type ParticipationSectionIcon = ComponentType<{ className?: string }>;

function ClubParticipationSection({
  sectionId,
  title,
  description,
  icon: Icon,
  children,
}: {
  sectionId: string;
  title: string;
  description?: string;
  icon: ParticipationSectionIcon;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={sectionId}
      className="rounded-xl border border-border/60 bg-muted/20 p-3.5 shadow-sm sm:p-4"
    >
      <div className="flex gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm"
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 id={sectionId} className="text-sm font-semibold tracking-tight text-foreground">
              {title}
            </h3>
            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

function competitionEntryStatusBadge(
  now: Date,
  entryStart: Date | null,
  entryEnd: Date | null
): { label: string; className: string } {
  if (!entryStart || !entryEnd) {
    return {
      label: "エントリー期間未設定",
      className: "border-border/80 bg-muted/50 font-normal text-muted-foreground",
    };
  }
  if (now < entryStart) {
    return {
      label: "エントリー開始前",
      className:
        "border-amber-300/70 bg-amber-50 font-normal text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100",
    };
  }
  if (now > entryEnd) {
    return {
      label: "エントリー終了",
      className: "border-border/80 bg-muted/60 font-normal text-muted-foreground",
    };
  }
  return {
    label: "エントリー受付中",
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
      label: "割当・マーシャル締切済み",
      className: "border-border/80 bg-muted/60 font-normal text-muted-foreground",
    };
  }
  if (row.assignmentOpen) {
    return {
      label: "メンバー割当の編集可",
      className:
        "border-emerald-300/70 bg-emerald-50 font-normal text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
    };
  }
  return {
    label: "割当・準備中",
    className: "border-border/80 bg-muted/50 font-normal text-muted-foreground",
  };
}

function teamAssignmentClosedHint(
  row: {
    teamCount: number;
    assignmentOpen: boolean;
    allTeamsMarshalBlocked: boolean;
    entryEndDate: Date | null;
  },
  now: Date
): string | null {
  if (row.teamCount === 0 || row.assignmentOpen) return null;
  if (row.allTeamsMarshalBlocked) {
    return "このクラブの全チームについて、スタートリスト上のヒートのマーシャル締切が入ったため、メンバー割当を変更できません。";
  }
  if (!row.entryEndDate) {
    return "エントリー終了日が未設定のため、割当可能期間を表示できません。";
  }
  if (now <= row.entryEndDate) {
    return "エントリー終了後からメンバー割当が可能になります。";
  }
  return null;
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
    <TabsContent value="competitions" className="space-y-3 pt-1.5 sm:space-y-4 sm:pt-2">
      <div id="club-team-assignment" className="scroll-mt-24 space-y-6">
        <Card className="overflow-hidden border-border/80 shadow-md">
          <CardHeader className="border-b border-border/60 bg-gradient-to-br from-primary/[0.06] via-muted/30 to-transparent px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="flex min-w-0 gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15">
                  <ClipboardList className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">参加大会</CardTitle>
                    {competitionTeamSummaries.length > 0 ? (
                      <Badge variant="secondary" className="tabular-nums font-medium">
                        {competitionTeamSummaries.length} 大会
                      </Badge>
                    ) : null}
                  </div>
                  <CardDescription className="text-sm leading-relaxed">
                    当クラブに紐づく個人またはチームのエントリーがある大会を表示します。
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full shrink-0 gap-2 sm:w-auto" asChild>
                <Link href={appRoutes.clubs.entries(clubId)}>
                  <History className="h-4 w-4" aria-hidden />
                  提出履歴
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-4 sm:p-6">
            {competitionTeamSummaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <ClipboardList className="h-6 w-6 opacity-80" aria-hidden />
                </span>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {isClubAdmin
                    ? "まだ表示できる大会がありません。所属クラブ必須の大会で、個人またはチームのエントリーがあるとここに表示されます。"
                    : "表示できる大会はまだありません。チーム種目の登録はクラブ管理者が行います。"}
                </p>
              </div>
            ) : (
              competitionRows.map(({ competition }) => {
                const row = summaryByCompetitionId.get(competition.id);
                if (!row) return null;
                const closedHint = teamAssignmentClosedHint(row, now);
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
                return (
                  <article
                    key={row.id}
                    className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
                  >
                    <div className="bg-gradient-to-br from-primary/[0.07] via-muted/25 to-background px-4 py-4 sm:px-5 sm:py-5">
                      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-start gap-2.5 sm:gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-800 shadow-sm ring-1 ring-amber-500/20 dark:bg-amber-400/10 dark:text-amber-200">
                              <Trophy className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1 space-y-2">
                              <p className="text-lg font-semibold leading-snug tracking-tight text-foreground">
                                {row.name}
                              </p>
                              <div className="flex flex-wrap items-start gap-1.5 sm:gap-2">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "max-w-full break-words text-[11px] font-normal",
                                    entryBadge.className
                                  )}
                                >
                                  {entryBadge.label}
                                </Badge>
                                {teamAssignBadge ? (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "max-w-full break-words text-[11px] font-normal",
                                      teamAssignBadge.className
                                    )}
                                  >
                                    {teamAssignBadge.label}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                                <span className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                                  <Calendar className="h-4 w-4 shrink-0 text-primary/80" aria-hidden />
                                  <span className="text-foreground/85">
                                    開催 {row.startDate.toLocaleDateString("ja-JP")}
                                  </span>
                                </span>
                                {competition.venue ? (
                                  <span className="flex min-w-0 items-start gap-1.5 sm:gap-2">
                                    <MapPin
                                      className="mt-0.5 h-4 w-4 shrink-0 text-primary/80"
                                      aria-hidden
                                    />
                                    <span className="min-w-0 break-words leading-relaxed">
                                      {competition.venue}
                                    </span>
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full shrink-0 border-border/80 shadow-sm sm:w-auto"
                          asChild
                        >
                          <Link href={appRoutes.competitions.root(row.id)} className="gap-2">
                            大会ページ
                            <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
                          </Link>
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3.5 p-3.5 sm:space-y-4 sm:p-5">
                      {competitionIdsFromToOnly.has(row.id) ? (
                        <p className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                          個人・チームの競技エントリーはまだありませんが、この大会ではテクニカルオフィシャル（TO）の記録または保留中の依頼があります。
                        </p>
                      ) : null}
                      <ClubParticipationSection
                        sectionId={`comp-individual-${row.id}`}
                        title="クラブ所属の個人エントリー"
                        description="閲覧専用: このクラブを所属として提出された個人種目のエントリー一覧です。"
                        icon={User}
                      >
                        <div className="space-y-2">
                          {rosterIndividual.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                              まだ当クラブ所属の個人種目エントリーはありません。
                            </p>
                          ) : (
                            <ClubRosterCollapsibleBlock
                              roster={rosterIndividual}
                              listLabel="個人種目エントリー一覧"
                            />
                          )}
                        </div>
                      </ClubParticipationSection>

                      <ClubParticipationSection
                        sectionId={`comp-team-${row.id}`}
                        title="チーム進捗"
                        description="登録チーム数と割り当て状況を確認し、割り当て専用ページへ進めます。"
                        icon={Users}
                      >
                        <div className="space-y-2.5 sm:space-y-3">
                          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
                            <div className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-background/80 to-muted/35 px-3 py-2.5 shadow-sm ring-1 ring-primary/10 sm:items-center sm:gap-3 sm:px-4 sm:py-3">
                              <span
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary shadow-inner ring-1 ring-primary/15 sm:h-11 sm:w-11 sm:rounded-2xl"
                                aria-hidden
                              >
                                <Users className="h-4.5 w-4.5 sm:h-5 sm:w-5" strokeWidth={1.75} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    登録チーム数
                                  </p>
                                  {row.teamCount === 0 && isClubAdmin ? (
                                    <Badge
                                      variant="outline"
                                      className="h-5 border-dashed border-amber-500/50 bg-amber-500/[0.06] text-[10px] font-normal text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100"
                                    >
                                      未登録
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="mt-1 flex items-baseline gap-1.5">
                                  <span className="text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">
                                    {row.teamCount}
                                  </span>
                                  <span className="text-sm font-medium text-muted-foreground">組</span>
                                </p>
                              </div>
                            </div>

                            {isClubAdmin ? (
                              <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-[11rem] sm:justify-center">
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="w-full shadow-sm sm:w-auto"
                                  asChild
                                >
                                  <Link
                                    href={appRoutes.clubs.competition.assignments(clubId, row.id)}
                                    className="gap-2"
                                  >
                                    割り当てへ
                                    <ArrowRight className="h-4 w-4" aria-hidden />
                                  </Link>
                                </Button>
                                <p className="text-left text-[11px] leading-snug text-muted-foreground sm:text-left">
                                  クラブ詳細配下の割り当て専用ページ
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs leading-relaxed text-muted-foreground sm:max-w-xs sm:self-center sm:text-right">
                                チーム種目の登録・割当はクラブ管理者が行います。
                              </p>
                            )}
                          </div>

                          {rosterTeam.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                              まだチーム登録メンバーがいません（割当前など）。
                            </p>
                          ) : (
                            <ClubRosterCollapsibleBlock
                              roster={rosterTeam}
                              listLabel="出場者（チーム）"
                            />
                          )}

                          {row.teamCount > 0 ? (
                            <div className="space-y-2 pt-0.5">
                              <div className="flex min-w-0 gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-xs leading-relaxed sm:gap-3 sm:px-3.5 sm:py-3">
                                <CalendarClock
                                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                                  aria-hidden
                                />
                                <div className="min-w-0">
                                  <p className="font-medium text-foreground">
                                    メンバー割当の目安（通知用）
                                  </p>
                                  <p className="mt-0.5 break-words text-muted-foreground">
                                    {row.assignmentDeadline
                                      ? row.assignmentDeadline.toLocaleString("ja-JP")
                                      : "未設定"}
                                  </p>
                                </div>
                              </div>
                              {closedHint ? (
                                <p className="rounded-xl border border-amber-500/35 bg-amber-500/[0.08] px-3.5 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/30 dark:text-amber-50">
                                  {closedHint}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </ClubParticipationSection>

                      {showTo ? (
                        <ClubParticipationSection
                          sectionId={`comp-to-${row.id}`}
                          title="テクニカルオフィシャル"
                          icon={UserCog}
                        >
                          <ClubTechnicalOfficialRowLazy
                            clubId={clubId}
                            competitionId={row.id}
                            competitionName={row.name}
                            isClubAdmin={isClubAdmin}
                          />
                        </ClubParticipationSection>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
