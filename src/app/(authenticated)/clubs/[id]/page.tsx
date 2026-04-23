import type { ComponentType, ReactNode } from "react";
import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { canViewClubDetailPage, redirectUnlessCanViewClubDetail } from "@/lib/clubAccess";
import { prisma } from "@/server/db";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/DataTable";
import ClubLogoUpload from "@/components/ClubLogoUpload";
import MemberActions from "@/components/MemberActions";
import ClubAnnouncements from "@/components/ClubAnnouncements";
import ClubActivities from "@/components/ClubActivities";
import { isClubAdminRole } from "@/lib/roleScopes";
import ClubRepresentativeSelector from "@/components/ClubRepresentativeSelector";
import LeaveClubButton from "@/components/LeaveClubButton";
import { resolveTeamAssignmentDeadline } from "@/lib/startListSettings";
import { getTeamEntryMarshalAssignmentBlockedMap } from "@/lib/teamMemberAssignmentWindow";
import {
  ArrowRight,
  Calendar,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  History,
  ImageIcon,
  MapPin,
  Trophy,
  User,
  UserCog,
  Users,
} from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { cn } from "@/lib/utils";
import ClubTechnicalOfficialRow from "@/components/ClubTechnicalOfficialRow";
import {
  buildClubCompetitionRosterMap,
  splitRosterByEntryKind,
  type ClubCompetitionRosterParticipant,
} from "@/lib/clubCompetitionRoster";

export const dynamic = "force-dynamic";

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

function membershipRoleLabel(role: string): string {
  if (role === "ADMIN") return "管理者";
  if (role === "MEMBER") return "メンバー";
  return role;
}

function membershipStatusLabel(status: string): string {
  switch (status) {
    case "APPROVED":
      return "承認済み";
    case "PENDING":
      return "承認待ち";
    case "REJECTED":
      return "却下";
    default:
      return status;
  }
}

function competitionEntryStatusBadge(
  now: Date,
  entryStart: Date | null,
  entryEnd: Date | null
): { label: string; className: string } {
  if (!entryStart || !entryEnd) {
    return {
      label: "エントリー期間未設定",
      className:
        "border-border/80 bg-muted/50 font-normal text-muted-foreground",
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
      className:
        "border-border/80 bg-muted/60 font-normal text-muted-foreground",
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
      className:
        "border-border/80 bg-muted/60 font-normal text-muted-foreground",
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
    className:
      "border-border/80 bg-muted/50 font-normal text-muted-foreground",
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId || !(await canViewClubDetailPage(id, sess.userId))) {
    return { title: "クラブ | Bluvium" };
  }

  const club = await prisma.club.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: `${club?.name || "クラブ"} | Bluvium`,
  };
}

export default async function ClubDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const sessionUser = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { id: true },
  });

  if (!sessionUser) redirect("/login");

  await redirectUnlessCanViewClubDetail(id, sess.userId);

  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      creator: {
        select: {
          familyName: true,
          givenName: true,
        },
      },
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              familyName: true,
              givenName: true,
              email: true,
            },
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!club) {
    redirect(appRoutes.clubs.list());
  }

  const userMembership = club.memberships.find((m) => m.userId === sess.userId);
  const isClubAdmin = !!(userMembership && isClubAdminRole(userMembership.role));
  const approvedMembers = club.memberships.filter((m) => m.status === "APPROVED");
  const pendingMembers = club.memberships.filter((m) => m.status === "PENDING");

  const clubStatusLabel = {
    APPLYING: "申請中",
    JLA_APPROVED: "審査通過",
    APPROVED: "有効",
    INACTIVE: "停止中",
    SUSPENDED: "凍結中",
    REJECTED: "却下",
  } as const;

  const now = new Date();

  const [clubTeamEntries, individualEntriesForClub] = await Promise.all([
    prisma.teamEntry.findMany({
      where: { clubId: id },
      select: {
        id: true,
        eventId: true,
        competitionId: true,
        competition: {
          select: {
            id: true,
            name: true,
            venue: true,
            startDate: true,
            entryStartDate: true,
            entryEndDate: true,
            startListSettings: true,
            status: true,
          },
        },
      },
    }),
    prisma.competitionEntry.findMany({
      where: { clubId: id, status: { not: "CANCELLED" } },
      select: { competitionId: true },
    }),
  ]);

  const candidateCompetitionIds = [
    ...new Set([
      ...clubTeamEntries.map((t) => t.competitionId),
      ...individualEntriesForClub.map((e) => e.competitionId),
    ]),
  ];

  const eligibleCompetitions =
    candidateCompetitionIds.length === 0
      ? []
      : await prisma.competition.findMany({
          where: {
            id: { in: candidateCompetitionIds },
          },
          select: {
            id: true,
            name: true,
            venue: true,
            startDate: true,
            entryStartDate: true,
            entryEndDate: true,
            startListSettings: true,
            status: true,
            officialRecruitmentEnabled: true,
            technicalOfficialRecruitmentEnabled: true,
            technicalOfficialTiers: true,
          },
        });
  const eligibleCompetitionById = new Map(eligibleCompetitions.map((c) => [c.id, c]));

  const technicalOfficialCompetitions: { id: string; name: string }[] = [];
  for (const c of eligibleCompetitions) {
    if (!c.officialRecruitmentEnabled || !c.technicalOfficialRecruitmentEnabled) continue;
    technicalOfficialCompetitions.push({ id: c.id, name: c.name });
  }
  technicalOfficialCompetitions.sort((a, b) => a.name.localeCompare(b.name, "ja"));

  type CompetitionTeamSummary = {
    id: string;
    name: string;
    startDate: Date;
    entryEndDate: Date | null;
    teamCount: number;
    assignmentOpen: boolean;
    assignmentDeadline: Date | null;
    allTeamsMarshalBlocked: boolean;
  };

  const competitionRows = (() => {
    const map = new Map<
      string,
      {
        competition: (typeof eligibleCompetitions)[0];
        entries: { id: string; eventId: string }[];
      }
    >();
    for (const row of clubTeamEntries) {
      const c = eligibleCompetitionById.get(row.competitionId);
      if (!c) continue;
      const prev = map.get(c.id);
      const piece = { id: row.id, eventId: row.eventId };
      if (prev) {
        prev.entries.push(piece);
      } else {
        map.set(c.id, { competition: c, entries: [piece] });
      }
    }
    for (const e of individualEntriesForClub) {
      const c = eligibleCompetitionById.get(e.competitionId);
      if (!c) continue;
      if (!map.has(c.id)) {
        map.set(c.id, { competition: c, entries: [] });
      }
    }
    return [...map.values()].sort(
      (a, b) => b.competition.startDate.getTime() - a.competition.startDate.getTime()
    );
  })();

  const marshalAllBlockedByCompetitionId = new Map<string, boolean>();
  for (const { competition, entries } of competitionRows) {
    if (entries.length === 0) {
      marshalAllBlockedByCompetitionId.set(competition.id, false);
      continue;
    }
    const blockMap = await getTeamEntryMarshalAssignmentBlockedMap(prisma, competition.id, entries);
    const allBlocked = entries.every((e) => blockMap.get(e.id));
    marshalAllBlockedByCompetitionId.set(competition.id, allBlocked);
  }

  const competitionTeamSummaries: CompetitionTeamSummary[] = competitionRows.map(
    ({ competition, entries }) => {
      const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
      const deadline = resolveTeamAssignmentDeadline(competition.startListSettings, competition.startDate);
      const afterEntryEnd = entryEnd !== null && now > entryEnd;
      const assignmentOpen = afterEntryEnd && !marshalAllBlockedByCompetitionId.get(competition.id);
      return {
        id: competition.id,
        name: competition.name,
        startDate: competition.startDate,
        entryEndDate: entryEnd,
        teamCount: entries.length,
        assignmentOpen,
        assignmentDeadline: deadline,
        allTeamsMarshalBlocked: marshalAllBlockedByCompetitionId.get(competition.id) ?? false,
      };
    }
  );

  const competitionIdsForRoster = competitionRows.map((r) => r.competition.id);
  const [individualEntriesForRoster, teamEntriesForRoster] =
    competitionIdsForRoster.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.competitionEntry.findMany({
            where: {
              clubId: id,
              competitionId: { in: competitionIdsForRoster },
              status: { not: "CANCELLED" },
            },
            select: {
              competitionId: true,
              userId: true,
              user: { select: { familyName: true, givenName: true } },
              items: {
                select: {
                  event: { select: { name: true, type: true } },
                },
              },
            },
          }),
          prisma.teamEntry.findMany({
            where: {
              clubId: id,
              competitionId: { in: competitionIdsForRoster },
            },
            select: {
              competitionId: true,
              teamName: true,
              event: { select: { name: true } },
              members: {
                select: {
                  userId: true,
                  user: { select: { familyName: true, givenName: true } },
                },
              },
            },
          }),
        ]);

  const rosterByCompetitionId = buildClubCompetitionRosterMap(
    individualEntriesForRoster,
    teamEntriesForRoster
  );

  const summaryByCompetitionId = new Map(
    competitionTeamSummaries.map((s) => [s.id, s] as const)
  );

  const technicalOfficialCompetitionIdSet = new Set(
    technicalOfficialCompetitions.map((c) => c.id)
  );

  const activeTab = tab === "competitions" ? "competitions" : "members";

  const clubStatusBadgeClass = {
    APPLYING: "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
    JLA_APPROVED: "border-orange-200 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100",
    APPROVED: "border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
    INACTIVE: "border-border bg-muted text-muted-foreground",
    SUSPENDED: "border-rose-200 bg-rose-100 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100",
    REJECTED: "border-red-200 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100",
  } as const;

  return (
    <div className="app-page mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/25 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">クラブ</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
                {club.name}
              </CardTitle>
              {club.nameKana ? (
                <CardDescription className="text-base font-normal">{club.nameKana}</CardDescription>
              ) : null}
            </div>
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 self-start text-sm font-medium",
                clubStatusBadgeClass[club.status as keyof typeof clubStatusBadgeClass] ??
                  "border-border bg-muted text-muted-foreground"
              )}
            >
              {clubStatusLabel[club.status as keyof typeof clubStatusLabel] ?? club.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-8 md:flex-row">
            <div className="flex shrink-0 justify-center md:justify-start">
              {isClubAdmin ? (
                <ClubLogoUpload
                  clubId={club.id}
                  currentLogoUrl={club.logoUrl}
                  clubName={club.name}
                />
              ) : club.logoUrl ? (
                <div className="h-32 w-32 overflow-hidden rounded-xl border-2 border-border shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={club.logoUrl}
                    alt={`${club.name}のロゴ`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50">
                  <ImageIcon className="h-10 w-10 text-muted-foreground/70" aria-hidden />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-6">
              <div className="space-y-6 text-sm">
                <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
                  <div className="space-y-3">
                    {(club.representativeFamilyName || club.representativeGivenName) && (
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <span className="text-muted-foreground">代表者</span>
                        <span className="font-medium text-foreground">
                          {club.representativeFamilyName} {club.representativeGivenName}
                        </span>
                      </div>
                    )}
                    {club.representativePhone && (
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <span className="text-muted-foreground">代表者TEL</span>
                        <span className="text-foreground">{club.representativePhone}</span>
                      </div>
                    )}
                    {club.officePhone && (
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <span className="text-muted-foreground">事務局TEL</span>
                        <span className="text-foreground">{club.officePhone}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      <span className="text-muted-foreground">メンバー数</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {approvedMembers.length} 名
                      </span>
                    </div>
                    {club.patrolLocation && (
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <span className="text-muted-foreground">監視場所</span>
                        <span className="text-foreground">{club.patrolLocation}</span>
                      </div>
                    )}
                    {club.establishedYear && (
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <span className="text-muted-foreground">設立年</span>
                        <span className="tabular-nums text-foreground">{club.establishedYear} 年</span>
                      </div>
                    )}
                  </div>
                </div>

                {(club.officePrefecture || club.officeCity || club.officeAddressLine1) && (
                  <div className="space-y-1 border-t border-border/60 pt-6">
                    <span className="text-muted-foreground">事務局住所</span>
                    <p className="text-foreground">
                      {club.officePostalCode && `〒${club.officePostalCode} `}
                      {club.officePrefecture}
                      {club.officeCity}
                      {club.officeAddressLine1}
                      {club.officeAddressLine2}
                    </p>
                  </div>
                )}
              </div>

              <ClubRepresentativeSelector
                clubId={club.id}
                currentRepresentativeUserId={club.representativeUserId}
                isClubAdmin={isClubAdmin}
                members={approvedMembers.map((m) => ({
                  userId: m.userId,
                  name: `${m.user.familyName} ${m.user.givenName}`,
                }))}
              />

              <div className="flex flex-wrap gap-3 border-t border-border/60 pt-6">
                {isClubAdmin && (
                  <Button asChild>
                    <Link href={appRoutes.clubs.edit(club.id)}>クラブ情報を編集</Link>
                  </Button>
                )}
                {userMembership?.status === "APPROVED" ? (
                  <LeaveClubButton clubId={club.id} clubName={club.name} />
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs key={activeTab} defaultValue={activeTab} className="w-full scroll-mt-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-border/80 bg-muted/35 p-1">
          <TabsTrigger
            value="members"
            className="gap-1.5 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:shadow-sm"
            asChild
          >
            {/* クエリだけ変わる遷移で先頭へスクロールしない（Next のデフォルト挙動） */}
            <Link href={appRoutes.clubs.tab(id, "members")} scroll={false}>
              メンバー
            </Link>
          </TabsTrigger>
          <TabsTrigger
            value="competitions"
            className="gap-1.5 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:shadow-sm"
            asChild
          >
            <Link href={appRoutes.clubs.tab(id, "competitions")} scroll={false}>
              大会
            </Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-5 space-y-6 sm:space-y-8">
          {userMembership && (
            <ClubAnnouncements
              clubId={club.id}
              currentUserId={sess.userId}
              currentUserRole={userMembership.role}
            />
          )}

          {userMembership && (
            <ClubActivities
              clubId={club.id}
              currentUserId={sess.userId}
              currentUserRole={userMembership.role}
            />
          )}

          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-border/60 pb-2">
              <Users className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="text-lg font-semibold tracking-tight text-foreground">メンバー管理</h2>
            </div>

            {isClubAdmin && pendingMembers.length > 0 && (
              <Card padding="none">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <span>参加申請</span>
                    <Badge variant="secondary" className="tabular-nums">
                      {pendingMembers.length} 件
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <DataTable
                  data={pendingMembers}
                  columns={[
                    {
                      header: "氏名",
                      accessor: (m) => `${m.user.familyName} ${m.user.givenName}`,
                      className: "font-medium text-foreground",
                    },
                    {
                      header: "メール",
                      accessor: (m) => m.user.email,
                      className: "font-mono text-sm text-muted-foreground",
                    },
                    {
                      header: "申請日",
                      accessor: (m) => new Date(m.createdAt).toLocaleDateString("ja-JP"),
                      className: "text-sm text-muted-foreground",
                    },
                    {
                      header: "操作",
                      accessor: (m) => (
                        <MemberActions
                          membershipId={m.id}
                          clubId={club.id}
                          status={m.status}
                          role={m.role}
                          currentUserId={sess.userId}
                          targetUserId={m.userId}
                          currentUserRole={userMembership?.role || "MEMBER"}
                        />
                      ),
                    },
                  ]}
                  keyExtractor={(m) => m.id}
                  emptyMessage="申請はありません"
                />
              </Card>
            )}

            <Card padding="none">
              <CardHeader>
                <CardTitle className="text-base">メンバー一覧</CardTitle>
              </CardHeader>
              <DataTable
                data={approvedMembers}
                columns={[
                  {
                    header: "氏名",
                    accessor: (m) => `${m.user.familyName} ${m.user.givenName}`,
                    className: "font-medium text-foreground",
                  },
                  {
                    header: "メール",
                    accessor: (m) => m.user.email,
                    className: "font-mono text-sm text-muted-foreground",
                  },
                  {
                    header: "役割",
                    accessor: (m) => (
                      <Badge
                        variant={isClubAdminRole(m.role) ? "default" : "secondary"}
                        className="font-normal"
                      >
                        {membershipRoleLabel(m.role)}
                      </Badge>
                    ),
                  },
                  {
                    header: "ステータス",
                    accessor: (m) => (
                      <Badge
                        variant="outline"
                        className={cn(
                          m.status === "APPROVED" &&
                            "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
                          m.status === "PENDING" &&
                            "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
                          m.status === "REJECTED" &&
                            "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
                        )}
                      >
                        {membershipStatusLabel(m.status)}
                      </Badge>
                    ),
                  },
                  ...(isClubAdmin
                    ? [
                        {
                          header: "操作",
                          accessor: (m: (typeof club.memberships)[0]) => (
                            <MemberActions
                              membershipId={m.id}
                              clubId={club.id}
                              status={m.status}
                              role={m.role}
                              currentUserId={sess.userId}
                              targetUserId={m.userId}
                              currentUserRole={userMembership?.role || "MEMBER"}
                            />
                          ),
                        },
                      ]
                    : []),
                ]}
                keyExtractor={(m) => m.id}
                emptyMessage="メンバーがいません"
              />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="competitions" className="mt-6 space-y-6">
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full shrink-0 gap-2 sm:w-auto"
                    asChild
                  >
                    <Link href={appRoutes.clubs.entries(id)}>
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
                      competition.entryStartDate
                        ? new Date(competition.entryStartDate)
                        : null,
                      competition.entryEndDate ? new Date(competition.entryEndDate) : null
                    );
                    const teamAssignBadge = teamAssignmentStatusBadge(row);
                    return (
                      <article
                        key={row.id}
                        className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
                      >
                        {/* 大会情報（ヒーロー） */}
                        <div className="bg-gradient-to-br from-primary/[0.07] via-muted/25 to-background px-4 py-4 sm:px-5 sm:py-5">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex flex-wrap items-start gap-3">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-800 shadow-sm ring-1 ring-amber-500/20 dark:bg-amber-400/10 dark:text-amber-200">
                                  <Trophy className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                                </span>
                                <div className="min-w-0 flex-1 space-y-2">
                                  <p className="text-lg font-semibold leading-snug tracking-tight text-foreground">
                                    {row.name}
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge
                                      variant="outline"
                                      className={cn("text-[11px] font-normal", entryBadge.className)}
                                    >
                                      {entryBadge.label}
                                    </Badge>
                                    {teamAssignBadge ? (
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "text-[11px] font-normal",
                                          teamAssignBadge.className
                                        )}
                                      >
                                        {teamAssignBadge.label}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                                    <span className="inline-flex flex-wrap items-center gap-2">
                                      <Calendar className="h-4 w-4 shrink-0 text-primary/80" aria-hidden />
                                      <span className="text-foreground/85">
                                        開催 {row.startDate.toLocaleDateString("ja-JP")}
                                      </span>
                                    </span>
                                    {competition.venue ? (
                                      <span className="inline-flex flex-wrap items-start gap-2">
                                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" aria-hidden />
                                        <span className="leading-relaxed">{competition.venue}</span>
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
                              <Link
                                href={appRoutes.competitions.root(row.id)}
                                className="gap-2"
                              >
                                大会ページ
                                <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
                              </Link>
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-4 p-4 sm:p-5">
                          {/* クラブ所属の個人エントリー一覧 */}
                          <ClubParticipationSection
                            sectionId={`comp-individual-${row.id}`}
                            title="クラブ所属の個人エントリー"
                            description="このクラブを所属として提出された個人種目のエントリーを一覧で確認できます。"
                            icon={User}
                          >
                            <div className="space-y-3">
                              {rosterIndividual.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                                  まだ当クラブ所属の個人種目エントリーはありません。申込は下のボタンから大会の個人エントリーページへ進めます。
                                </p>
                              ) : (
                                <ClubRosterCollapsibleBlock
                                  roster={rosterIndividual}
                                  listLabel="個人種目エントリー一覧"
                                />
                              )}
                              <Button variant="outline" size="sm" className="w-full sm:w-fit" asChild>
                                <Link href={appRoutes.competitions.entry(row.id)} className="gap-2">
                                  個人エントリー申込ページを開く
                                  <ArrowRight className="h-4 w-4" aria-hidden />
                                </Link>
                              </Button>
                            </div>
                          </ClubParticipationSection>

                          {/* チーム種目（ハブ） */}
                          <ClubParticipationSection
                            sectionId={`comp-team-${row.id}`}
                            title="チーム種目"
                            description="エントリー・請求・履歴とメンバー割当を、同じページでまとめて操作できます。"
                            icon={Users}
                          >
                            <div className="space-y-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
                                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-background/80 to-muted/35 px-4 py-3 shadow-sm ring-1 ring-primary/10">
                                  <span
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-inner ring-1 ring-primary/15"
                                    aria-hidden
                                  >
                                    <Users className="h-5 w-5" strokeWidth={1.75} />
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
                                      <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                                        {row.teamCount}
                                      </span>
                                      <span className="text-sm font-medium text-muted-foreground">組</span>
                                    </p>
                                  </div>
                                </div>

                                {isClubAdmin ? (
                                  <div className="flex w-full flex-col justify-center gap-1.5 sm:w-auto sm:min-w-[11rem]">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="w-full shadow-sm sm:w-auto"
                                      asChild
                                    >
                                      <Link
                                        href={appRoutes.clubs.competition.team(id, row.id)}
                                        className="gap-2"
                                      >
                                        チーム種目へ
                                        <ArrowRight className="h-4 w-4" aria-hidden />
                                      </Link>
                                    </Button>
                                    <p className="text-center text-[11px] leading-snug text-muted-foreground sm:text-left">
                                      タブでエントリーと割当を切替
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
                                <ClubRosterCollapsibleBlock roster={rosterTeam} listLabel="出場者（チーム）" />
                              )}

                              {row.teamCount > 0 ? (
                                <div className="space-y-2 pt-0.5">
                                  <div className="flex gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3 text-xs leading-relaxed">
                                    <CalendarClock
                                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                                      aria-hidden
                                    />
                                    <div>
                                      <p className="font-medium text-foreground">メンバー割当の目安（通知用）</p>
                                      <p className="mt-0.5 text-muted-foreground">
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

                          {/* テクニカルオフィシャル */}
                          {showTo ? (
                            <ClubParticipationSection
                              sectionId={`comp-to-${row.id}`}
                              title="テクニカルオフィシャル依頼"
                              description="主催のオフィシャル資格要件設定に連動して、クラブからのTO依頼を行います。"
                              icon={UserCog}
                            >
                              <ClubTechnicalOfficialRow
                                clubId={id}
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
      </Tabs>
    </div>
  );
}
