import { cache } from "react";
import type { ResultRound } from "@prisma/client";
import { verifySessionCached } from "@/lib/auth";
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
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
import { verifyDayOpsUnlockFromCookies } from "@/lib/dayOpsUnlockCookie";

type ParticipantStatusRow = {
  participantType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
  status: string;
  marshalRound: ResultRound;
  updatedAt: Date;
  calledAt: Date | null;
};

/** メタデータとページ本体で同一リクエスト内の二重クエリを避ける */
export const getStartListEventDetail = cache(async (competitionId: string, eventId: string) => {
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

export type StartListEventPageIndividual = {
  entryId: string;
  userId: string;
  name: string;
  clubId: string | null;
  clubName: string | null;
};

export type StartListEventPageTeam = {
  teamEntryId: string;
  teamName: string;
  clubId: string | null;
  clubName: string | null;
  members: string[];
};

export type StartListEventPageLoaded =
  | { kind: "notFound" }
  | {
      kind: "hidden";
      competitionId: string;
      dayOpsUnlockConfigured: boolean;
      hasDayOpsUnlock: boolean;
    }
  | {
      kind: "ok";
      competitionId: string;
      eventId: string;
      dayOpsUnlockConfigured: boolean;
      hasDayOpsUnlock: boolean;
      showUnifiedStartListCard: boolean;
      showVenueOps: boolean;
      canManageStartListOps: boolean;
      isOrgAdmin: boolean;
      initialRoundIndex: number | null;
      competitionName: string;
      startListSettings: unknown;
      archiveRecordedAtIso: string | null;
      scheduleLabel: string | null;
      event: {
        id: string;
        name: string;
        sex: string;
        type: "INDIVIDUAL" | "TEAM";
        ageCategoryName: string | null;
        preliminaryHeatLaneCount: number | null;
        startListRoundCount: number | null;
        heatPlanConfirmedAtIso: string | null;
        marshalStartedAtIso: string | null;
      };
      individuals: StartListEventPageIndividual[];
      teams: StartListEventPageTeam[];
      officialRanksByRound: Partial<Record<ResultRound, Record<string, number>>>;
      placementSeed: number;
      frozenSnapshotRounds: ReturnType<typeof extractFrozenRoundsForEventFromSnapshotData>;
      participantStatusByKey: ReturnType<typeof buildParticipantDayOpsStatusByKey>;
      participantStatusRows: ParticipantStatusRow[];
      roundHeatBarItems: StartListEventBarItem[] | null;
    };

export async function loadStartListEventPage(input: {
  competitionId: string;
  eventId: string;
  sessionToken: string | undefined;
  initialRoundIndex: number | null;
}): Promise<StartListEventPageLoaded> {
  const { competitionId, eventId, sessionToken, initialRoundIndex } = input;
  const session = await verifySessionCached(sessionToken);
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
            status: true,
            admins: {
              where: { userId: sessionUserId ?? "clinvalidnosessionuser0000" },
              select: { role: true },
            },
          },
        },
        startListSnapshot: {
          select: { capturedAt: true, data: true },
        },
      },
    }),
    getStartListEventDetail(competitionId, eventId),
    verifyDayOpsUnlockFromCookies(competitionId),
  ]);

  if (!competition || !event) {
    return { kind: "notFound" };
  }

  const dayOpsUnlockConfigured = Boolean(competition.dayOpsAccessSecretHash);
  const isOrgAdmin = hasOrgAdminAccess(competition.organization.admins);
  const canManageStartListOps = canManageCompetitionStartListSettings({
    orgAdminsForCurrentUser: competition.organization.admins,
    orgStatus: competition.organization.status,
    hasDayOpsUnlock,
  });
  const showUnifiedStartListCard = canManageStartListOps;
  const showVenueOps = isOrgAdmin || hasDayOpsUnlock;

  if (competition.status === "DRAFT" && !isOrgAdmin) {
    return { kind: "notFound" };
  }

  const canViewStartListOnPublicPage =
    (competition.startListPubliclyVisible ?? true) || isOrgAdmin || hasDayOpsUnlock;

  if (!canViewStartListOnPublicPage) {
    return {
      kind: "hidden",
      competitionId,
      dayOpsUnlockConfigured,
      hasDayOpsUnlock,
    };
  }

  const needRoundHeatBarItems = isOrgAdmin && showUnifiedStartListCard;

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
        ...competitionEntryEligibleForStartListWhere,
        items: { some: { eventId } },
      },
      select: {
        id: true,
        userId: true,
        club: { select: { id: true, name: true } },
        user: { select: { profile: { select: { familyName: true, givenName: true } } } },
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
            user: { select: { profile: { select: { familyName: true, givenName: true } } } },
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
      const key = row.entryType === "TEAM" ? row.teamEntryId : row.competitionEntryId;
      if (!key) continue;
      const prev = m[key];
      if (prev === undefined || row.rank < prev) m[key] = row.rank;
    }
    if (Object.keys(m).length > 0) {
      officialRanksByRound[or.round] = m;
    }
  }

  const individuals: StartListEventPageIndividual[] = [];
  const placementIndividualIds: string[] = [];
  for (const entry of liveEntries) {
    if (excludedIndividualEntryIds.has(entry.id)) continue;
    const item = entry.items[0];
    if (!item) continue;
    placementIndividualIds.push(entry.id);
    individuals.push({
      entryId: entry.id,
      userId: entry.userId,
      name: `${entry.user.profile?.familyName ?? ""} ${entry.user.profile?.givenName ?? ""}`.trim(),
      clubId: entry.club?.id ?? null,
      clubName: entry.club?.name ?? null,
    });
  }
  placementIndividualIds.sort();

  const teams: StartListEventPageTeam[] = [];
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
        .map(
          (member) =>
            `${member.user.profile?.familyName ?? ""} ${member.user.profile?.givenName ?? ""}`.trim()
        )
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

  return {
    kind: "ok",
    competitionId,
    eventId,
    dayOpsUnlockConfigured,
    hasDayOpsUnlock,
    showUnifiedStartListCard,
    showVenueOps,
    canManageStartListOps,
    isOrgAdmin,
    initialRoundIndex,
    competitionName: competition.name,
    startListSettings: competition.startListSettings,
    archiveRecordedAtIso,
    scheduleLabel,
    event: {
      id: event.id,
      name: event.name,
      sex: event.sex,
      type: event.type,
      ageCategoryName: event.ageCategory?.name ?? null,
      preliminaryHeatLaneCount: event.preliminaryHeatLaneCount ?? null,
      startListRoundCount: event.startListRoundCount ?? null,
      heatPlanConfirmedAtIso: event.startListHeatPlanConfirmedAt?.toISOString() ?? null,
      marshalStartedAtIso: event.marshalStartedAt?.toISOString() ?? null,
    },
    individuals,
    teams,
    officialRanksByRound,
    placementSeed,
    frozenSnapshotRounds,
    participantStatusByKey,
    participantStatusRows: participantStatusRows.map((row) => ({
      participantType: row.participantType,
      competitionEntryId: row.competitionEntryId,
      teamEntryId: row.teamEntryId,
      status: row.status,
      marshalRound: row.marshalRound ?? "HEAT",
      updatedAt: row.updatedAt,
      calledAt: row.calledAt,
    })),
    roundHeatBarItems,
  };
}
