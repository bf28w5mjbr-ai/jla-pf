import type { Prisma, ResultRound, ResultStatus } from "@prisma/client";
import { buildParticipantStatusStringMapForRound } from "@/lib/competitionParticipantStatusScope";
import { fetchParticipantStatusesForMarshalEvent } from "@/lib/marshalHeatCalledCount";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import {
  getHeatFromRoundData,
  getRoundDataFromSnapshot,
  marshalParticipantRefsForAutoDsq,
  resolveMarshalSlotInHeat,
  type MarshalParticipantRef,
} from "@/lib/heatMarshalFromSnapshot";
import {
  marshalIndividualKey,
  marshalTeamLegacyKey,
} from "@/lib/dayOpsParticipantKeys";
import { foldTeamMemberStatuses } from "@/lib/dayOpsTeamStatus";
import { isOfficialResultEffectivelyLockedForCompetition } from "@/lib/officialResultAutoLock";

export type OfficialResultTerminalSyncResult = {
  officialSyncSkipped: boolean;
};

/** @deprecated use OfficialResultTerminalSyncResult */
export type OfficialResultDsqSyncResult = OfficialResultTerminalSyncResult;

export const TERMINAL_OFFICIAL_STATUSES = ["DNS", "DNF", "DSQ", "WITHDRAWN"] as const;
export type TerminalOfficialStatus = (typeof TERMINAL_OFFICIAL_STATUSES)[number];

export const TERMINAL_DAY_OPS_STATUSES = ["DNS", "DNF", "DSQ", "WITHDRAWN"] as const;
export type TerminalDayOpsStatus = (typeof TERMINAL_DAY_OPS_STATUSES)[number];

const REMARKS_MAX = 500;

export function truncateTerminalRemarks(reason: string | null | undefined): string | null {
  if (reason == null) return null;
  const t = reason.trim();
  if (!t) return null;
  return t.length <= REMARKS_MAX ? t : t.slice(0, REMARKS_MAX);
}

/** @deprecated use truncateTerminalRemarks */
export const truncateDsqRemarks = truncateTerminalRemarks;

export function isTerminalOnlyOfficialRow(row: {
  status: string;
  rank: number | null;
  advanceWithoutRank: boolean;
}): boolean {
  return (
    (TERMINAL_OFFICIAL_STATUSES as readonly string[]).includes(row.status) &&
    row.rank == null &&
    !row.advanceWithoutRank
  );
}

/** @deprecated use isTerminalOnlyOfficialRow */
export function isDsqOnlyOfficialRow(row: {
  status: string;
  rank: number | null;
  advanceWithoutRank: boolean;
}): boolean {
  return isTerminalOnlyOfficialRow(row);
}

function dayOpsStatusToOfficial(status: string): TerminalDayOpsStatus | null {
  if ((TERMINAL_DAY_OPS_STATUSES as readonly string[]).includes(status)) {
    return status as TerminalDayOpsStatus;
  }
  return null;
}

export function resolveParticipantTerminalStatusForRound(
  ref: MarshalParticipantRef,
  statusByKey: Map<string, string>
): TerminalDayOpsStatus | null {
  if (ref.participantType === "INDIVIDUAL" && ref.competitionEntryId) {
    const st = statusByKey.get(marshalIndividualKey(ref.competitionEntryId));
    return dayOpsStatusToOfficial(st ?? "");
  }
  if (ref.participantType === "TEAM" && ref.teamEntryId) {
    const prefix = `${marshalTeamLegacyKey(ref.teamEntryId)}:`;
    const memberStatuses: string[] = [];
    for (const [k, v] of statusByKey) {
      if (k.startsWith(prefix)) memberStatuses.push(v);
    }
    const legacy = statusByKey.get(marshalTeamLegacyKey(ref.teamEntryId));
    if (legacy) memberStatuses.push(legacy);
    const folded = foldTeamMemberStatuses(memberStatuses);
    return dayOpsStatusToOfficial(folded);
  }
  return null;
}

/** @deprecated use resolveParticipantTerminalStatusForRound === DSQ */
export function isParticipantDsqForRound(
  ref: MarshalParticipantRef,
  statusByKey: Map<string, string>
): boolean {
  return resolveParticipantTerminalStatusForRound(ref, statusByKey) === "DSQ";
}

function rowLookupWhere(
  officialResultId: string,
  heatIndex: number,
  ref: MarshalParticipantRef
) {
  if (ref.participantType === "INDIVIDUAL" && ref.competitionEntryId) {
    return {
      officialResultId,
      heat: heatIndex,
      entryType: "INDIVIDUAL" as const,
      competitionEntryId: ref.competitionEntryId,
    };
  }
  if (ref.participantType === "TEAM" && ref.teamEntryId) {
    return {
      officialResultId,
      heat: heatIndex,
      entryType: "TEAM" as const,
      teamEntryId: ref.teamEntryId,
    };
  }
  return null;
}

export async function ensureOfficialResultForRound(
  tx: Prisma.TransactionClient,
  competitionId: string,
  eventId: string,
  round: ResultRound
): Promise<{ officialResultId: string; locked: false } | { locked: true }> {
  const existing = await tx.officialResult.findUnique({
    where: {
      competitionId_eventId_round: { competitionId, eventId, round },
    },
    select: { id: true, lockedAt: true },
  });
  if (
    await isOfficialResultEffectivelyLockedForCompetition(
      tx,
      competitionId,
      existing?.lockedAt
    )
  ) {
    return { locked: true };
  }
  const officialResult = await tx.officialResult.upsert({
    where: {
      competitionId_eventId_round: { competitionId, eventId, round },
    },
    create: {
      competitionId,
      eventId,
      round,
      publishedAt: null,
      lockedAt: null,
    },
    update: {},
    select: { id: true },
  });
  return { officialResultId: officialResult.id, locked: false };
}

/**
 * 参加者の終了ステータスに合わせて公式結果行を同期（作成または上書き）。
 */
export async function applyOfficialRowForParticipantTerminal(
  tx: Prisma.TransactionClient,
  opts: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    heatIndex: number;
    lane: number;
    participant: MarshalParticipantRef;
    status: TerminalOfficialStatus;
    reason?: string | null;
  }
): Promise<OfficialResultTerminalSyncResult> {
  const ensured = await ensureOfficialResultForRound(
    tx,
    opts.competitionId,
    opts.eventId,
    opts.round
  );
  if (ensured.locked) {
    return { officialSyncSkipped: true };
  }

  const lookup = rowLookupWhere(ensured.officialResultId, opts.heatIndex, opts.participant);
  if (!lookup) {
    return { officialSyncSkipped: false };
  }

  const remarks = truncateTerminalRemarks(opts.reason);
  const data = {
    status: opts.status,
    rank: null,
    advanceWithoutRank: false,
    heat: opts.heatIndex,
    lane: opts.lane,
    remarks,
    tieGroup: null,
    unit: "OTHER" as const,
  };

  const existing = await tx.officialResultRow.findFirst({
    where: lookup,
    select: { id: true },
  });

  if (existing) {
    await tx.officialResultRow.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await tx.officialResultRow.create({
      data: {
        officialResultId: ensured.officialResultId,
        entryType: opts.participant.participantType === "INDIVIDUAL" ? "INDIVIDUAL" : "TEAM",
        competitionEntryId: opts.participant.competitionEntryId,
        teamEntryId: opts.participant.teamEntryId,
        ...data,
      },
    });
  }

  return { officialSyncSkipped: false };
}

/** @deprecated use applyOfficialRowForParticipantTerminal with status DSQ */
export async function applyOfficialRowForParticipantDsq(
  tx: Prisma.TransactionClient,
  opts: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    heatIndex: number;
    lane: number;
    participant: MarshalParticipantRef;
    reason?: string | null;
  }
): Promise<OfficialResultTerminalSyncResult> {
  return applyOfficialRowForParticipantTerminal(tx, { ...opts, status: "DSQ" });
}

/**
 * 終了ステータス取り消し後: ターミナルのみの公式行を削除。着順・ランアップ付き行は触らない。
 */
export async function clearOfficialRowAfterTerminalRevert(
  tx: Prisma.TransactionClient,
  opts: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    participant: MarshalParticipantRef;
    heatIndex?: number | null;
    /** 削除対象の公式ステータス（省略時は行の status がターミナルのみなら削除） */
    terminalStatus?: TerminalOfficialStatus;
  }
): Promise<OfficialResultTerminalSyncResult> {
  const existing = await tx.officialResult.findUnique({
    where: {
      competitionId_eventId_round: {
        competitionId: opts.competitionId,
        eventId: opts.eventId,
        round: opts.round,
      },
    },
    select: { id: true, lockedAt: true },
  });
  if (!existing) {
    return { officialSyncSkipped: false };
  }
  if (
    await isOfficialResultEffectivelyLockedForCompetition(
      tx,
      opts.competitionId,
      existing.lockedAt
    )
  ) {
    return { officialSyncSkipped: true };
  }

  const heatFilter =
    opts.heatIndex != null && opts.heatIndex >= 1 ? { heat: opts.heatIndex } : {};

  const rowWhere =
    opts.participant.participantType === "INDIVIDUAL" && opts.participant.competitionEntryId
      ? {
          officialResultId: existing.id,
          entryType: "INDIVIDUAL" as const,
          competitionEntryId: opts.participant.competitionEntryId,
          ...heatFilter,
        }
      : opts.participant.participantType === "TEAM" && opts.participant.teamEntryId
        ? {
            officialResultId: existing.id,
            entryType: "TEAM" as const,
            teamEntryId: opts.participant.teamEntryId,
            ...heatFilter,
          }
        : null;

  if (!rowWhere) {
    return { officialSyncSkipped: false };
  }

  const rows = await tx.officialResultRow.findMany({
    where: rowWhere,
    select: { id: true, status: true, rank: true, advanceWithoutRank: true },
  });

  const toDelete = rows.filter((row) => {
    if (!isTerminalOnlyOfficialRow(row)) return false;
    if (opts.terminalStatus) return row.status === opts.terminalStatus;
    return true;
  });
  if (toDelete.length > 0) {
    await tx.officialResultRow.deleteMany({
      where: { id: { in: toDelete.map((r) => r.id) } },
    });
  }

  return { officialSyncSkipped: false };
}

/** @deprecated use clearOfficialRowAfterTerminalRevert */
export const clearOfficialRowAfterDsqRevert = clearOfficialRowAfterTerminalRevert;

/**
 * ヒート確定前の整合: スナップショット上の参加者の終了ステータスと公式行を揃える。
 */
export async function reconcileOfficialTerminalRowsForHeat(
  tx: Prisma.TransactionClient,
  opts: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    heatIndex: number;
    snapshot: StartListSnapshotPayload | null;
    statusRows?: Awaited<ReturnType<typeof fetchParticipantStatusesForMarshalEvent>>;
  }
): Promise<OfficialResultTerminalSyncResult> {
  const ensured = await ensureOfficialResultForRound(
    tx,
    opts.competitionId,
    opts.eventId,
    opts.round
  );
  if (ensured.locked) {
    return { officialSyncSkipped: true };
  }

  const roundData = getRoundDataFromSnapshot(opts.snapshot, opts.eventId, opts.round);
  const heat = getHeatFromRoundData(roundData, opts.heatIndex);
  const refs = marshalParticipantRefsForAutoDsq(roundData, opts.heatIndex);

  const statusRows =
    opts.statusRows ??
    (await fetchParticipantStatusesForMarshalEvent(tx, opts.competitionId, opts.eventId));
  const statusByKey = buildParticipantStatusStringMapForRound(statusRows, opts.round);

  let skipped = false;

  for (const ref of refs) {
    const slot = resolveMarshalSlotInHeat(heat, ref);
    if (!slot) continue;
    const terminalStatus = resolveParticipantTerminalStatusForRound(ref, statusByKey);
    if (terminalStatus) {
      const sync = await applyOfficialRowForParticipantTerminal(tx, {
        competitionId: opts.competitionId,
        eventId: opts.eventId,
        round: opts.round,
        heatIndex: opts.heatIndex,
        lane: slot.lane,
        participant: ref,
        status: terminalStatus,
        reason: null,
      });
      if (sync.officialSyncSkipped) skipped = true;
    }
  }

  const terminalRows = await tx.officialResultRow.findMany({
    where: {
      officialResultId: ensured.officialResultId,
      heat: opts.heatIndex,
      status: { in: [...TERMINAL_OFFICIAL_STATUSES] },
    },
    select: {
      id: true,
      entryType: true,
      competitionEntryId: true,
      teamEntryId: true,
      status: true,
      rank: true,
      advanceWithoutRank: true,
    },
  });

  for (const row of terminalRows) {
    const ref: MarshalParticipantRef | null =
      row.entryType === "INDIVIDUAL" && row.competitionEntryId
        ? {
            participantType: "INDIVIDUAL",
            competitionEntryId: row.competitionEntryId,
            teamEntryId: null,
          }
        : row.entryType === "TEAM" && row.teamEntryId
          ? {
              participantType: "TEAM",
              competitionEntryId: null,
              teamEntryId: row.teamEntryId,
            }
          : null;
    if (!ref) continue;
    const current = resolveParticipantTerminalStatusForRound(ref, statusByKey);
    if (current !== row.status) {
      if (isTerminalOnlyOfficialRow(row)) {
        await tx.officialResultRow.delete({ where: { id: row.id } });
      }
    }
  }

  return { officialSyncSkipped: skipped };
}

/** @deprecated use reconcileOfficialTerminalRowsForHeat */
export const reconcileOfficialDsqRowsForHeat = reconcileOfficialTerminalRowsForHeat;

export function toOfficialMarshalParticipantRef(ref: MarshalParticipantRef): MarshalParticipantRef {
  if (ref.participantType === "TEAM" && ref.teamEntryId) {
    return {
      participantType: "TEAM",
      competitionEntryId: null,
      teamEntryId: ref.teamEntryId,
    };
  }
  return ref;
}

export async function syncOfficialTerminalRowFromSnapshot(
  tx: Prisma.TransactionClient,
  opts: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    snapshot: StartListSnapshotPayload | null;
    participant: MarshalParticipantRef;
    status: TerminalOfficialStatus;
    reason?: string | null;
  }
): Promise<OfficialResultTerminalSyncResult> {
  const roundData = getRoundDataFromSnapshot(opts.snapshot, opts.eventId, opts.round);
  for (const heat of roundData?.heats ?? []) {
    const slot = resolveMarshalSlotInHeat(heat, opts.participant);
    if (slot) {
      return applyOfficialRowForParticipantTerminal(tx, {
        competitionId: opts.competitionId,
        eventId: opts.eventId,
        round: opts.round,
        heatIndex: heat.heatIndex,
        lane: slot.lane,
        participant: opts.participant,
        status: opts.status,
        reason: opts.reason,
      });
    }
  }
  return { officialSyncSkipped: false };
}

/** @deprecated use syncOfficialTerminalRowFromSnapshot */
export async function syncOfficialDsqRowFromSnapshot(
  tx: Prisma.TransactionClient,
  opts: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    snapshot: StartListSnapshotPayload | null;
    participant: MarshalParticipantRef;
    reason?: string | null;
  }
): Promise<OfficialResultTerminalSyncResult> {
  return syncOfficialTerminalRowFromSnapshot(tx, { ...opts, status: "DSQ" });
}
