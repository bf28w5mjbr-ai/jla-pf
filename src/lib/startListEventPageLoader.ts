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
import { getMarshalActiveRoundsForEvents } from "@/lib/marshalRoundSettingsLock";
import { buildParticipantDayOpsStatusByKey } from "@/lib/dayOpsParticipantStatusDisplay";
import { verifyDayOpsUnlockFromCookies } from "@/lib/dayOpsUnlockCookie";
import {
  buildStartListLineupFromEntries,
  buildStartListLineupFromFrozenRounds,
  overlayLiveTeamMembersFromDb,
} from "@/lib/buildStartListLineupParticipants";
import {
  countUniqueParticipantsInFrozenRounds,
  EMPTY_PUBLIC_LINEUP,
  loadPublicTeamLineupForEvent,
} from "@/lib/startListSnapshotReadHelpers";
import {
  resolveStartListPeriodicSyncIntervalSec,
  resolveStartListPublicRefreshIntervalSec,
} from "@/lib/startListPeriodicSync";
import { toIsoStringOrNull } from "@/lib/datetimeLocal";
import type {
  StartListEventCardProps,
  StartListEventPageIndividual,
  StartListEventPageTeam,
} from "@/lib/startListEventTypes";

export type { StartListEventPageIndividual, StartListEventPageTeam };

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
        select: { id: true, name: true, displayOrder: true },
      },
    },
  });
});

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
      dayOpsUnlockConfigured: boolean;
      hasDayOpsUnlock: boolean;
      cardProps: StartListEventCardProps;
    };

export async function loadStartListEventPage(input: {
  competitionId: string;
  eventId: string;
  sessionToken: string | undefined;
}): Promise<StartListEventPageLoaded> {
  const { competitionId, eventId, sessionToken } = input;
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

  const scheduleLabel = formatEventScheduleJa(event.scheduledStartAt, event.scheduledEndAt);
  const archiveRecordedAtIso = toIsoStringOrNull(competition.startListSnapshot?.capturedAt);
  const frozenSnapshotRounds = extractFrozenRoundsForEventFromSnapshotData(
    competition.startListSnapshot?.data,
    eventId
  );

  if (!canManageStartListOps) {
    const isTeam = event.type === "TEAM";
    const teams =
      isTeam && frozenSnapshotRounds?.length
        ? await loadPublicTeamLineupForEvent(competitionId, eventId)
        : EMPTY_PUBLIC_LINEUP.teams;
    const individuals = EMPTY_PUBLIC_LINEUP.individuals;
    const entryCount =
      countUniqueParticipantsInFrozenRounds(frozenSnapshotRounds, isTeam) ||
      (isTeam ? teams.length : individuals.length);
    const placementFingerprint = `${archiveRecordedAtIso ?? ""}|snapshot-public`;
    const placementSeed = computePlacementSeed(competitionId, eventId, placementFingerprint);

    return {
      kind: "ok",
      competitionId,
      dayOpsUnlockConfigured,
      hasDayOpsUnlock,
      cardProps: {
        viewMode: "public",
        competitionId,
        competitionName: competition.name,
        archiveRecordedAtIso,
        event: {
          id: event.id,
          name: event.name,
          sex: event.sex,
          type: event.type,
          ageCategoryName: event.ageCategory?.name ?? null,
          preliminaryHeatLaneCount: event.preliminaryHeatLaneCount ?? null,
          startListRoundCount: event.startListRoundCount ?? null,
          heatPlanConfirmedAtIso: toIsoStringOrNull(event.startListHeatPlanConfirmedAt),
          marshalStartedAtIso: toIsoStringOrNull(event.marshalStartedAt),
        },
        initialSettings: competition.startListSettings,
        defaultMaxLanesPerRace: event.preliminaryHeatLaneCount ?? null,
        entryCount,
        scheduleLabel,
        individuals,
        teams,
        officialRanksByRound: {},
        placementSeed,
        frozenSnapshotRounds,
        participantStatusByKey: {},
        initialParticipantStatusRows: [],
        initialRoundIndex: null,
        roundHeatBarItems: null,
        permissions: {
          canManageStartListOps: false,
          isOrgAdmin,
          showVenueOps,
        },
        periodicSyncEnabled: true,
        periodicSnapshotSync: false,
        periodicSyncIntervalSec: resolveStartListPublicRefreshIntervalSec(),
      },
    };
  }

  /** org 管理者のみ全種目 bar を取得（当日運用のみアンロックは ops UI だがインライン保存用データなし） */
  const needRoundHeatBarItems = isOrgAdmin && canManageStartListOps;
  const heatPlanConfirmed = Boolean(event.startListHeatPlanConfirmedAt);
  const isTeamEvent = event.type === "TEAM";
  const hasFrozenHeats = Boolean(
    heatPlanConfirmed &&
      frozenSnapshotRounds?.some((r) => Array.isArray(r.heats) && r.heats.length > 0)
  );

  const [
    liveEntries,
    liveTeamEntries,
    officialResults,
    participantStatusRows,
    roundHeatBarItems,
  ] = await Promise.all([
    hasFrozenHeats
      ? Promise.resolve([])
      : prisma.competitionEntry.findMany({
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
    hasFrozenHeats && !isTeamEvent
      ? Promise.resolve([])
      : isTeamEvent
        ? prisma.teamEntry.findMany({
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
    })
        : Promise.resolve([]),
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
                ageCategory: { select: { id: true, name: true, displayOrder: true } },
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
          const marshalActiveByEventId = await getMarshalActiveRoundsForEvents(
            prisma,
            competitionId,
            allEventsForHeat.map((e) => e.id)
          );
          const mapped: StartListEventBarItem[] = allEventsForHeat.map((e) => ({
            id: e.id,
            name: e.name,
            sex: e.sex,
            type: e.type,
            displayOrder: e.displayOrder,
            ageCategoryId: e.ageCategory?.id ?? null,
            ageCategoryName: e.ageCategory?.name ?? null,
            ageCategoryDisplayOrder: e.ageCategory?.displayOrder ?? null,
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
            marshalLockedRounds: [...(marshalActiveByEventId.get(e.id) ?? new Set<ResultRound>())],
          }));
          return sortEventsByScheduleTabs(mapped, scheduleTabsRow);
        })()
      : Promise.resolve<StartListEventBarItem[] | null>(null),
  ]);

  const participantStatusByKey = buildParticipantDayOpsStatusByKey(participantStatusRows);

  const frozenLineup =
    hasFrozenHeats && frozenSnapshotRounds
      ? buildStartListLineupFromFrozenRounds({
          frozenSnapshotRounds,
          isTeam: event.type === "TEAM",
          participantStatusRows,
        })
      : null;

  let { individuals, teams, placementIndividualIds, placementTeamIds } =
    frozenLineup ??
    buildStartListLineupFromEntries({
      liveEntries,
      liveTeamEntries,
      participantStatusRows,
    });

  if (isTeamEvent && liveTeamEntries.length > 0) {
    teams = overlayLiveTeamMembersFromDb(teams, liveTeamEntries);
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

  const placementFingerprint = `${archiveRecordedAtIso ?? ""}|i:${placementIndividualIds.join(",")}|t:${placementTeamIds.join(",")}`;
  const placementSeed = computePlacementSeed(competitionId, eventId, placementFingerprint);

  const mappedParticipantRows = participantStatusRows.map((row) => ({
    participantType: row.participantType,
    competitionEntryId: row.competitionEntryId,
    teamEntryId: row.teamEntryId,
    status: row.status,
    marshalRound: row.marshalRound ?? "HEAT",
    updatedAt: row.updatedAt,
    calledAt: row.calledAt,
  }));

  return {
    kind: "ok",
    competitionId,
    dayOpsUnlockConfigured,
    hasDayOpsUnlock,
    cardProps: {
      viewMode: "ops" as const,
      competitionId,
      competitionName: competition.name,
      archiveRecordedAtIso,
      event: {
        id: event.id,
        name: event.name,
        sex: event.sex,
        type: event.type,
        ageCategoryName: event.ageCategory?.name ?? null,
        preliminaryHeatLaneCount: event.preliminaryHeatLaneCount ?? null,
        startListRoundCount: event.startListRoundCount ?? null,
        heatPlanConfirmedAtIso: toIsoStringOrNull(event.startListHeatPlanConfirmedAt),
        marshalStartedAtIso: toIsoStringOrNull(event.marshalStartedAt),
      },
      initialSettings: competition.startListSettings,
      defaultMaxLanesPerRace: event.preliminaryHeatLaneCount ?? null,
      entryCount: event.type === "TEAM" ? teams.length : individuals.length,
      scheduleLabel,
      individuals,
      teams,
      officialRanksByRound,
      placementSeed,
      frozenSnapshotRounds,
      participantStatusByKey,
      initialParticipantStatusRows: mappedParticipantRows,
      initialRoundIndex: null,
      roundHeatBarItems,
      permissions: {
        canManageStartListOps,
        isOrgAdmin,
        showVenueOps,
      },
      /** 当日運用のみの端末は day-ops ポーリングで足りる。主催設定権限があるときだけ meta 同期 */
      periodicSyncEnabled: canManageStartListOps,
      periodicSnapshotSync: false,
      periodicSyncIntervalSec: resolveStartListPeriodicSyncIntervalSec(),
    },
  };
}
