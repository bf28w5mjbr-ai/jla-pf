import Link from "next/link";
import nextDynamic from "next/dynamic";
import { Metadata } from "next";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { competitionEntryPaidCheckoutWhere } from "@/lib/entryCheckoutSessionPaid";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import type { ResultRound } from "@prisma/client";
import { parseStartListSettings } from "@/lib/startListSettings";
import { sortEventsByScheduleTabs } from "@/lib/competitionScheduleTabDisplay";
import { fetchPaidEntryCountByEventId } from "@/lib/competitionStartListEntryCounts";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import { formatEventScheduleJa } from "@/lib/eventScheduleDisplay";
import { computePlacementSeed } from "@/lib/startListHeatPlacement";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import {
  buildParticipantDayOpsStatusByKey,
  shouldHideFromStartListLineupParticipantRow,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { ChevronLeft } from "lucide-react";
import { verifyDayOpsUnlockFromCookies } from "@/lib/dayOpsUnlockCookie";
import DayOpsUnlockBanner from "@/components/DayOpsUnlockBanner";

const CompetitionStartListEventBlock = nextDynamic(
  () => import("@/components/CompetitionStartListEventBlock"),
  {
    loading: () => (
      <div className="min-h-[12rem] animate-pulse rounded-lg border border-border/60 bg-muted/25" />
    ),
  }
);

import StartListEventUnifiedCard from "@/components/StartListEventUnifiedCard";

export const dynamic = "force-dynamic";

/** メタデータとページ本体で同一リクエスト内の二重クエリを避ける */
const getStartListEventDetail = cache(async (competitionId: string, eventId: string) => {
  return prisma.event.findFirst({
    where: { id: eventId, competitionId },
    select: {
      id: true,
      name: true,
      sex: true,
      type: true,
      category: true,
      preliminaryHeatLaneCount: true,
      startListRoundCount: true,
      startListHeatPlanConfirmedAt: true,
      marshalStartedAt: true,
      scheduledStartAt: true,
      scheduledEndAt: true,
      ageCategory: {
        select: { id: true, name: true },
      },
    },
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}): Promise<Metadata> {
  const { id, eventId } = await params;
  const event = await getStartListEventDetail(id, eventId);
  return {
    title: event?.name ? `${event.name} スタートリスト | Bluvium` : "スタートリスト | Bluvium",
  };
}

export default async function CompetitionEventStartListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ roundIndex?: string }>;
}) {
  const { id: competitionId, eventId } = await params;
  const sp = await searchParams;
  const rawRoundIndex = sp.roundIndex;
  const parsedRoundIndex =
    typeof rawRoundIndex === "string" && rawRoundIndex.trim() !== ""
      ? Number.parseInt(rawRoundIndex, 10)
      : Number.NaN;
  const initialRoundIndex =
    Number.isFinite(parsedRoundIndex) &&
    Number.isInteger(parsedRoundIndex) &&
    parsedRoundIndex >= 0
      ? parsedRoundIndex
      : null;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);
  const sessionUserId = session?.userId ?? null;

  const [competition, event, hasDayOpsUnlock] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        name: true,
        status: true,
        dayOpsAccessSecretHash: true,
        startListPubliclyVisible: true,
        startListSettings: true,
        organization: {
          select: {
            admins: {
              where: { userId: sessionUserId ?? "clinvalidnosessionuser0000" },
              select: { role: true },
            },
          },
        },
        startListSnapshot: {
          select: { capturedAt: true, data: true },
        },
        events: {
          select: { id: true },
          orderBy: { displayOrder: "asc" },
        },
      },
    }),
    getStartListEventDetail(competitionId, eventId),
    verifyDayOpsUnlockFromCookies(competitionId),
  ]);

  if (!competition || !event) {
    notFound();
  }

  const dayOpsUnlockConfigured = Boolean(competition.dayOpsAccessSecretHash);

  const isOrgAdmin = hasOrgAdminAccess(competition.organization.admins);
  const canManageStartListOps = canManageCompetitionStartListSettings({
    orgAdminsForCurrentUser: competition.organization.admins,
    hasDayOpsUnlock,
  });
  const showUnifiedStartListCard = canManageStartListOps;
  const showVenueOps = isOrgAdmin || hasDayOpsUnlock;

  if (competition.status === "DRAFT" && !isOrgAdmin) {
    notFound();
  }

  const canViewStartListOnPublicPage =
    (competition.startListPubliclyVisible ?? true) || isOrgAdmin || hasDayOpsUnlock;

  if (!canViewStartListOnPublicPage) {
    return (
      <div className="app-page mx-auto max-w-3xl space-y-3.5 px-3 py-4 sm:max-w-4xl sm:px-5 sm:py-6">
        <DayOpsUnlockBanner
          competitionId={competitionId}
          passphraseConfigured={dayOpsUnlockConfigured}
          alreadyUnlocked={hasDayOpsUnlock}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1 px-3 text-xs shadow-sm" asChild>
            <Link href={`/competitions/${competitionId}`}>
              <ChevronLeft className="size-4" />
              大会ページへ
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          この大会のスタートリスト全体が主催の設定により非公開です（種目ごとの切替ではありません）。主催管理者または当日運用でアンロック済みの端末から閲覧できます。
        </p>
      </div>
    );
  }

  const { eventSettings: settings } = parseStartListSettings(competition.startListSettings);
  const setting = settings[event.id] ?? { mode: "count" as const, heatCount: "1", heatSize: "" };

  const needRoundHeatBarItems =
    isOrgAdmin && showUnifiedStartListCard && !event.startListHeatPlanConfirmedAt;

  const [
    liveEntries,
    liveTeamEntries,
    officialResults,
    participantStatusRows,
    roundHeatBarItems,
  ] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: {
        competitionId,
        status: "SUBMITTED",
        OR: [{ totalFee: { lte: 0 } }, competitionEntryPaidCheckoutWhere],
        items: { some: { eventId } },
      },
      select: {
        id: true,
        userId: true,
        club: { select: { id: true, name: true } },
        user: { select: { familyName: true, givenName: true } },
        items: { where: { eventId }, take: 1, select: { eventId: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.teamEntry.findMany({
      where: { competitionId, eventId },
      select: {
        id: true,
        teamName: true,
        club: { select: { id: true, name: true } },
        members: {
          orderBy: { order: "asc" },
          select: {
            user: { select: { familyName: true, givenName: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.officialResult.findMany({
      where: { competitionId, eventId },
      select: {
        round: true,
        rows: {
          select: {
            entryType: true,
            competitionEntryId: true,
            teamEntryId: true,
            rank: true,
          },
        },
      },
    }),
    prisma.competitionParticipantStatus.findMany({
      where: { competitionId, eventId },
      orderBy: { updatedAt: "desc" },
      select: {
        participantType: true,
        competitionEntryId: true,
        teamEntryId: true,
        teamMemberUserId: true,
        status: true,
        reason: true,
        marshalRound: true,
        updatedAt: true,
        calledAt: true,
      },
    }),
    needRoundHeatBarItems
      ? (async (): Promise<StartListEventBarItem[]> => {
          const [scheduleTabsRow, allEventsForHeat] = await Promise.all([
            prisma.competitionScheduleTab.findMany({
              where: { competitionId },
              orderBy: { displayOrder: "asc" },
              select: { id: true, name: true, displayOrder: true },
            }),
            prisma.event.findMany({
              where: { competitionId },
              select: {
                id: true,
                name: true,
                sex: true,
                type: true,
                displayOrder: true,
                scheduledStartAt: true,
                roundScheduledStarts: true,
                scheduledEndAt: true,
                startListRoundCount: true,
                scheduleTabId: true,
                scheduleTabSortOrder: true,
                preliminaryHeatLaneCount: true,
                startListHeatPlanConfirmedAt: true,
                marshalStartedAt: true,
                ageCategory: { select: { id: true, name: true } },
              },
              orderBy: [{ displayOrder: "asc" }, { sex: "asc" }, { id: "asc" }],
            }),
          ]);
          const entryCountByEventId =
            allEventsForHeat.length > 0
              ? await fetchPaidEntryCountByEventId(
                  competitionId,
                  allEventsForHeat.map((e) => ({ id: e.id, type: e.type }))
                )
              : {};
          const mapped: StartListEventBarItem[] = allEventsForHeat.map((e) => ({
            id: e.id,
            name: e.name,
            sex: e.sex,
            type: e.type,
            displayOrder: e.displayOrder,
            ageCategoryId: e.ageCategory?.id ?? null,
            ageCategoryName: e.ageCategory?.name ?? null,
            scheduledStartAt: e.scheduledStartAt,
            roundScheduledStarts: e.roundScheduledStarts,
            scheduledEndAt: e.scheduledEndAt,
            startListRoundCount: e.startListRoundCount ?? undefined,
            scheduleTabId: e.scheduleTabId,
            scheduleTabSortOrder: e.scheduleTabSortOrder,
            entryCount: entryCountByEventId[e.id] ?? 0,
            preliminaryHeatLaneCount: e.preliminaryHeatLaneCount,
            startListHeatPlanConfirmedAt: e.startListHeatPlanConfirmedAt,
            marshalStartedAt: e.marshalStartedAt,
          }));
          return sortEventsByScheduleTabs(mapped, scheduleTabsRow);
        })()
      : Promise.resolve<StartListEventBarItem[] | null>(null),
  ]);

  const participantStatusByKey = buildParticipantDayOpsStatusByKey(participantStatusRows);

  const excludedIndividualEntryIds = new Set<string>();
  const indRowsByEntry = new Map<string, typeof participantStatusRows>();
  for (const row of participantStatusRows) {
    if (row.participantType !== "INDIVIDUAL" || !row.competitionEntryId) continue;
    const id = row.competitionEntryId;
    if (!indRowsByEntry.has(id)) indRowsByEntry.set(id, []);
    indRowsByEntry.get(id)!.push(row);
  }
  for (const [entryId, rows] of indRowsByEntry) {
    if (
      rows.some((r) =>
        shouldHideFromStartListLineupParticipantRow({ status: r.status, reason: r.reason })
      )
    ) {
      excludedIndividualEntryIds.add(entryId);
    }
  }
  const excludedTeamEntryIds = new Set<string>();
  const teamRowsById = new Map<string, typeof participantStatusRows>();
  for (const row of participantStatusRows) {
    if (row.participantType !== "TEAM" || !row.teamEntryId) continue;
    const id = row.teamEntryId;
    if (!teamRowsById.has(id)) teamRowsById.set(id, []);
    teamRowsById.get(id)!.push(row);
  }
  for (const [teamId, rows] of teamRowsById) {
    if (
      rows.some((r) =>
        shouldHideFromStartListLineupParticipantRow({ status: r.status, reason: r.reason })
      )
    ) {
      excludedTeamEntryIds.add(teamId);
    }
  }

  const officialRanksByRound: Partial<Record<ResultRound, Record<string, number>>> = {};
  for (const or of officialResults) {
    const m: Record<string, number> = {};
    for (const row of or.rows) {
      if (typeof row.rank !== "number" || !Number.isFinite(row.rank)) continue;
      const key =
        row.entryType === "TEAM" ? row.teamEntryId : row.competitionEntryId;
      if (!key) continue;
      const prev = m[key];
      if (prev === undefined || row.rank < prev) m[key] = row.rank;
    }
    if (Object.keys(m).length > 0) {
      officialRanksByRound[or.round] = m;
    }
  }

  const individuals: Array<{
    entryId: string;
    userId: string;
    name: string;
    clubId: string | null;
    clubName: string | null;
  }> = [];
  const placementIndividualIds: string[] = [];
  for (const entry of liveEntries) {
    if (excludedIndividualEntryIds.has(entry.id)) continue;
    const item = entry.items[0];
    if (!item) continue;
    placementIndividualIds.push(entry.id);
    individuals.push({
      entryId: entry.id,
      userId: entry.userId,
      name: `${entry.user.familyName} ${entry.user.givenName}`,
      clubId: entry.club?.id ?? null,
      clubName: entry.club?.name ?? null,
    });
  }
  placementIndividualIds.sort();

  const teams: Array<{
    teamEntryId: string;
    teamName: string;
    clubId: string | null;
    clubName: string | null;
    members: string[];
  }> = [];
  const placementTeamIds: string[] = [];
  for (const teamEntry of liveTeamEntries) {
    if (excludedTeamEntryIds.has(teamEntry.id)) continue;
    placementTeamIds.push(teamEntry.id);
    teams.push({
      teamEntryId: teamEntry.id,
      teamName: teamEntry.teamName,
      clubId: teamEntry.club?.id ?? null,
      clubName: teamEntry.club?.name ?? null,
      members: teamEntry.members
        .map((member) => `${member.user.familyName} ${member.user.givenName}`)
        .filter(Boolean),
    });
  }
  placementTeamIds.sort();

  const scheduleLabel = formatEventScheduleJa(event.scheduledStartAt, event.scheduledEndAt);
  const archiveRecordedAtIso = competition.startListSnapshot?.capturedAt
    ? new Date(competition.startListSnapshot.capturedAt).toISOString()
    : null;

  const placementFingerprint = `${archiveRecordedAtIso ?? ""}|i:${placementIndividualIds.join(",")}|t:${placementTeamIds.join(",")}`;
  const placementSeed = computePlacementSeed(competitionId, eventId, placementFingerprint);

  const frozenSnapshotRounds = extractFrozenRoundsForEventFromSnapshotData(
    competition.startListSnapshot?.data,
    eventId
  );

  return (
    <div className="app-page mx-auto max-w-3xl space-y-3.5 px-3 py-4 sm:max-w-4xl sm:px-5 sm:py-6">
      <DayOpsUnlockBanner
        competitionId={competitionId}
        passphraseConfigured={dayOpsUnlockConfigured}
        alreadyUnlocked={hasDayOpsUnlock}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-9 gap-1 px-3 text-xs shadow-sm" asChild>
          <Link href={`/competitions/${competitionId}?tab=start-list`}>
            <ChevronLeft className="size-4" />
            タイムスケジュールへ
          </Link>
        </Button>
      </div>

      {showUnifiedStartListCard ? (
        <StartListEventUnifiedCard
          competitionId={competitionId}
          competitionName={competition.name}
          archiveRecordedAtIso={archiveRecordedAtIso}
          event={{
            id: event.id,
            name: event.name,
            sex: event.sex,
            type: event.type,
            ageCategoryName: event.ageCategory?.name ?? null,
          }}
          initialSettings={competition.startListSettings}
          defaultMaxLanesPerRace={event.preliminaryHeatLaneCount}
          configuredStartListRoundCount={event.startListRoundCount ?? null}
          entryCount={event.type === "TEAM" ? teams.length : individuals.length}
          scheduleLabel={scheduleLabel}
          individuals={individuals}
          teams={teams}
          officialRanksByRound={officialRanksByRound}
          placementSeed={placementSeed}
          frozenSnapshotRounds={frozenSnapshotRounds}
          startListRoundCount={event.startListRoundCount ?? null}
          preliminaryHeatLaneCount={event.preliminaryHeatLaneCount ?? null}
          heatPlanConfirmedAtIso={event.startListHeatPlanConfirmedAt?.toISOString() ?? null}
          marshalStartedAtIso={event.marshalStartedAt?.toISOString() ?? null}
          canEditHeatConfiguration={canManageStartListOps}
          canEditPublishedScheduleForRoundSetup={isOrgAdmin}
          showMarshalOps={showVenueOps}
          showResultOps={showVenueOps}
          participantStatusByKey={participantStatusByKey}
          initialParticipantStatusRows={participantStatusRows}
          initialRoundIndex={initialRoundIndex}
          roundHeatBarItems={roundHeatBarItems}
        />
      ) : (
        <CompetitionStartListEventBlock
          competitionName={competition.name}
          archiveRecordedAtIso={archiveRecordedAtIso}
          scheduleLabel={scheduleLabel}
          event={{
            id: event.id,
            name: event.name,
            sex: event.sex,
            type: event.type,
            ageCategoryName: event.ageCategory?.name ?? null,
          }}
          individuals={individuals}
          teams={teams}
          setting={setting}
          officialRanksByRound={officialRanksByRound}
          placementSeed={placementSeed}
          frozenSnapshotRounds={frozenSnapshotRounds}
          startListRoundCount={event.startListRoundCount ?? null}
          preliminaryHeatLaneCount={event.preliminaryHeatLaneCount ?? null}
          heatPlanStep1Confirmed={Boolean(event.startListHeatPlanConfirmedAt)}
          participantStatusByKey={participantStatusByKey}
          initialParticipantStatusRows={participantStatusRows}
          softRefreshIntervalSec={25}
        />
      )}
    </div>
  );
}
