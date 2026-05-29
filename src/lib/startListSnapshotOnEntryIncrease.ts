import type { NextRequest } from "next/server";
import type { EventType } from "@prisma/client";
import { prisma } from "@/server/db";
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { hasIndividualWithdrawalForEvent } from "@/lib/entryWithdrawalAdminLabel";
import {
  getRoundDataFromSnapshot,
  parseStartListSnapshotLooseForRoundRead,
} from "@/lib/heatMarshalFromSnapshot";
import {
  eventHeatRoundMarshalCallClosed,
  getMarshalActiveRoundsForEvents,
} from "@/lib/marshalRoundSettingsLock";
import { replaceCompetitionStartListSnapshotWithAudit } from "@/lib/replaceStartListSnapshotWithAudit";
import { safeServerErrorLog } from "@/lib/safeServerLog";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";

export type StartListSnapshotBeforeMarshalSyncTrigger =
  | "ENTRY_SAVE"
  | "HOST_INVITE"
  | "PAYMENT_ESTABLISHED"
  | "TEAM_ENTRIES_SAVE"
  | "STRIPE_CHECKOUT"
  | "ENTRY_WITHDRAW"
  | "ENTRY_CANCEL"
  | "POST_PAY_REVOKE"
  | "PERIODIC_POLL";

/** @deprecated Use {@link StartListSnapshotBeforeMarshalSyncTrigger} */
export type StartListSnapshotEntryIncreaseTrigger = StartListSnapshotBeforeMarshalSyncTrigger;

export type SyncStartListSnapshotBeforeMarshalResult = {
  refreshedEventIds: string[];
  skippedReason?: "NO_CANDIDATE_EVENTS" | "NO_SNAPSHOT" | "ALREADY_IN_SYNC";
};

/** @deprecated Use {@link SyncStartListSnapshotBeforeMarshalResult} */
export type RefreshStartListSnapshotOnEntryIncreaseResult = SyncStartListSnapshotBeforeMarshalResult;

export function participantIdSetsMatch(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function loadSnapshotHeatParticipantIds(
  payload: StartListSnapshotPayload | null,
  eventId: string,
  eventType: EventType
): string[] {
  const round = getRoundDataFromSnapshot(payload, eventId, "HEAT");
  if (!round?.heats?.length) return [];
  const ids: string[] = [];
  for (const heat of round.heats) {
    for (const p of heat.participants) {
      if (eventType === "TEAM" && p.kind === "TEAM") {
        ids.push(p.teamEntryId);
      } else if (eventType === "INDIVIDUAL" && p.kind === "INDIVIDUAL") {
        ids.push(p.entryId);
      }
    }
  }
  ids.sort();
  return ids;
}

/** {@link buildStartListSnapshotPayload} と同じ成立条件で種目のライブ参加者 ID を返す */
export async function loadLiveEligibleParticipantIdsForEvent(params: {
  competitionId: string;
  eventId: string;
  eventType: EventType;
}): Promise<string[]> {
  const { competitionId, eventId, eventType } = params;
  if (eventType === "TEAM") {
    const rows = await prisma.teamEntry.findMany({
      where: { competitionId, eventId },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    return rows.map((r) => r.id);
  }

  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId,
      status: "SUBMITTED",
      ...competitionEntryEligibleForStartListWhere,
      items: { some: { eventId } },
    },
    select: {
      id: true,
      participantStatuses: {
        where: { eventId },
        select: { eventId: true, status: true, reason: true },
      },
    },
    orderBy: { id: "asc" },
  });

  const ids = entries
    .filter((entry) => !hasIndividualWithdrawalForEvent(entry.participantStatuses, eventId))
    .map((entry) => entry.id);
  ids.sort();
  return ids;
}

export function countSnapshotHeatParticipants(
  payload: StartListSnapshotPayload | null,
  eventId: string
): number {
  const round = getRoundDataFromSnapshot(payload, eventId, "HEAT");
  if (!round?.heats?.length) return 0;
  return round.heats.reduce((sum, heat) => sum + (heat.participants?.length ?? 0), 0);
}

/** @deprecated Prefer {@link loadLiveEligibleParticipantIdsForEvent} */
export async function countLiveEligibleParticipantsForEvent(params: {
  competitionId: string;
  eventId: string;
  eventType: EventType;
}): Promise<number> {
  const ids = await loadLiveEligibleParticipantIdsForEvent(params);
  return ids.length;
}

export async function resolveEventIdsNeedingSnapshotSync(params: {
  competitionId: string;
  candidateEventIds: readonly string[];
  snapshotData: unknown;
}): Promise<string[]> {
  const uniqueIds = [...new Set(params.candidateEventIds.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) return [];

  const marshalLockedMap = await getMarshalActiveRoundsForEvents(
    prisma,
    params.competitionId,
    uniqueIds
  );
  const syncEligibleIds = uniqueIds.filter(
    (id) => !eventHeatRoundMarshalCallClosed(marshalLockedMap, id)
  );
  if (syncEligibleIds.length === 0) return [];

  const events = await prisma.event.findMany({
    where: {
      competitionId: params.competitionId,
      id: { in: syncEligibleIds },
    },
    select: { id: true, type: true },
  });
  if (events.length === 0) return [];

  const payload = parseStartListSnapshotLooseForRoundRead(params.snapshotData);
  const outOfSync: string[] = [];

  await Promise.all(
    events.map(async (ev) => {
      const [liveIds, snapshotIds] = await Promise.all([
        loadLiveEligibleParticipantIdsForEvent({
          competitionId: params.competitionId,
          eventId: ev.id,
          eventType: ev.type,
        }),
        Promise.resolve(loadSnapshotHeatParticipantIds(payload, ev.id, ev.type)),
      ]);
      if (!participantIdSetsMatch(liveIds, snapshotIds)) {
        outOfSync.push(ev.id);
      }
    })
  );

  return outOfSync;
}

/** @deprecated Use {@link resolveEventIdsNeedingSnapshotSync} */
export async function resolveEventIdsWithIncreasedEligibleParticipants(params: {
  competitionId: string;
  candidateEventIds: readonly string[];
  snapshotData: unknown;
}): Promise<string[]> {
  return resolveEventIdsNeedingSnapshotSync(params);
}

export async function loadCandidateEventIdsForCompetitionEntry(
  entryId: string
): Promise<{ competitionId: string; eventIds: string[] } | null> {
  const entry = await prisma.competitionEntry.findUnique({
    where: { id: entryId },
    select: {
      competitionId: true,
      items: { select: { eventId: true } },
    },
  });
  if (!entry) return null;
  return {
    competitionId: entry.competitionId,
    eventIds: [...new Set(entry.items.map((item) => item.eventId))],
  };
}

export function collectEventIdsFromEntrySavePayload(
  entryItems: ReadonlyArray<{ eventId: string }>,
  teamEntries: ReadonlyArray<{ eventId: string }>,
  previousEntryEventIds?: readonly string[]
): string[] {
  return [
    ...new Set([
      ...entryItems.map((row) => row.eventId),
      ...teamEntries.map((row) => row.eventId),
      ...(previousEntryEventIds ?? []),
    ]),
  ];
}

export async function countTeamEntriesByEventForClub(params: {
  competitionId: string;
  clubId: string;
}): Promise<Map<string, number>> {
  const rows = await prisma.teamEntry.groupBy({
    by: ["eventId"],
    where: { competitionId: params.competitionId, clubId: params.clubId },
    _count: { id: true },
  });
  return new Map(rows.map((row) => [row.eventId, row._count.id]));
}

export function eventIdsWithTeamCountChange(
  before: Map<string, number>,
  after: Map<string, number>
): string[] {
  const eventIds = new Set([...before.keys(), ...after.keys()]);
  const changed: string[] = [];
  for (const eventId of eventIds) {
    if ((before.get(eventId) ?? 0) !== (after.get(eventId) ?? 0)) {
      changed.push(eventId);
    }
  }
  return changed;
}

/** @deprecated Use {@link eventIdsWithTeamCountChange} */
export function eventIdsWithTeamCountIncrease(
  before: Map<string, number>,
  after: Map<string, number>
): string[] {
  return eventIdsWithTeamCountChange(before, after);
}

/**
 * マーシャル未開始かつスナップショット記録ありのとき、ライブ成立参加者と HEAT スナップショットが
 * 食い違う種目だけ HEAT を再生成する。失敗時は呼び出し元の本処理を壊さない（ログのみ）。
 */
export async function syncStartListSnapshotBeforeMarshal(params: {
  competitionId: string;
  candidateEventIds: readonly string[];
  createdByUserId?: string;
  trigger: StartListSnapshotBeforeMarshalSyncTrigger;
  request?: NextRequest;
}): Promise<SyncStartListSnapshotBeforeMarshalResult> {
  const uniqueIds = [...new Set(params.candidateEventIds.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) {
    return { refreshedEventIds: [], skippedReason: "NO_CANDIDATE_EVENTS" };
  }

  try {
    const snapshotRow = await prisma.competitionStartListSnapshot.findUnique({
      where: { competitionId: params.competitionId },
      select: { id: true, data: true },
    });
    if (!snapshotRow) {
      return { refreshedEventIds: [], skippedReason: "NO_SNAPSHOT" };
    }

    const rebuildIds = await resolveEventIdsNeedingSnapshotSync({
      competitionId: params.competitionId,
      candidateEventIds: uniqueIds,
      snapshotData: snapshotRow.data,
    });
    if (rebuildIds.length === 0) {
      return { refreshedEventIds: [], skippedReason: "ALREADY_IN_SYNC" };
    }

    await replaceCompetitionStartListSnapshotWithAudit(params.request ?? null, {
      competitionId: params.competitionId,
      sessionUserId: params.createdByUserId ?? null,
      onlyRebuildEventIds: rebuildIds,
      auditMetadata: {
        autoBeforeMarshalSync: true,
        syncTrigger: params.trigger,
        rebuiltEventIds: rebuildIds,
      },
    });

    return { refreshedEventIds: rebuildIds };
  } catch (error) {
    safeServerErrorLog(
      `syncStartListSnapshotBeforeMarshal competitionId=${params.competitionId} trigger=${params.trigger} events=${uniqueIds.join(",")}`,
      error
    );
    return { refreshedEventIds: [] };
  }
}

/** @deprecated Use {@link syncStartListSnapshotBeforeMarshal} */
export async function refreshStartListSnapshotOnEligibleEntryIncrease(params: {
  competitionId: string;
  candidateEventIds: readonly string[];
  createdByUserId?: string;
  trigger: StartListSnapshotBeforeMarshalSyncTrigger;
  request?: NextRequest;
}): Promise<SyncStartListSnapshotBeforeMarshalResult> {
  return syncStartListSnapshotBeforeMarshal(params);
}
