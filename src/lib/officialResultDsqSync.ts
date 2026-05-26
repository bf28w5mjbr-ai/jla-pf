import type { Prisma, ResultRound } from "@prisma/client";
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

export type OfficialResultDsqSyncResult = {
  officialSyncSkipped: boolean;
};

const REMARKS_MAX = 500;

export function truncateDsqRemarks(reason: string | null | undefined): string | null {
  if (reason == null) return null;
  const t = reason.trim();
  if (!t) return null;
  return t.length <= REMARKS_MAX ? t : t.slice(0, REMARKS_MAX);
}

/** 公式行が「DSQ のみ」（着順・ランアップなし）か */
export function isDsqOnlyOfficialRow(row: {
  status: string;
  rank: number | null;
  advanceWithoutRank: boolean;
}): boolean {
  return row.status === "DSQ" && row.rank == null && !row.advanceWithoutRank;
}

export function isParticipantDsqForRound(
  ref: MarshalParticipantRef,
  statusByKey: Map<string, string>
): boolean {
  if (ref.participantType === "INDIVIDUAL" && ref.competitionEntryId) {
    return statusByKey.get(`I:${ref.competitionEntryId}`) === "DSQ";
  }
  if (ref.participantType === "TEAM" && ref.teamEntryId) {
    const prefix = `T:${ref.teamEntryId}:`;
    for (const [k, v] of statusByKey) {
      if (k.startsWith(prefix) && v === "DSQ") return true;
    }
    return statusByKey.get(`T:${ref.teamEntryId}`) === "DSQ";
  }
  return false;
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
  if (existing?.lockedAt) {
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
 * 参加者 DSQ に合わせて公式結果行を DSQ にする（作成または上書き）。
 */
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
): Promise<OfficialResultDsqSyncResult> {
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

  const remarks = truncateDsqRemarks(opts.reason);
  const data = {
    status: "DSQ" as const,
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

/**
 * DSQ 取り消し後: DSQ のみの公式行を削除。着順・ランアップ付き行は触らない。
 */
export async function clearOfficialRowAfterDsqRevert(
  tx: Prisma.TransactionClient,
  opts: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    participant: MarshalParticipantRef;
    heatIndex?: number | null;
  }
): Promise<OfficialResultDsqSyncResult> {
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
  if (existing.lockedAt) {
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

  const toDelete = rows.filter(isDsqOnlyOfficialRow);
  if (toDelete.length > 0) {
    await tx.officialResultRow.deleteMany({
      where: { id: { in: toDelete.map((r) => r.id) } },
    });
  }

  return { officialSyncSkipped: false };
}

/**
 * ヒート確定前の整合: スナップショット上の参加者の DSQ と公式行を揃える。
 */
export async function reconcileOfficialDsqRowsForHeat(
  tx: Prisma.TransactionClient,
  opts: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    heatIndex: number;
    snapshot: StartListSnapshotPayload | null;
  }
): Promise<OfficialResultDsqSyncResult> {
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

  const statusRows = await fetchParticipantStatusesForMarshalEvent(
    tx,
    opts.competitionId,
    opts.eventId
  );
  const statusByKey = buildParticipantStatusStringMapForRound(statusRows, opts.round);

  let skipped = false;

  for (const ref of refs) {
    const slot = resolveMarshalSlotInHeat(heat, ref);
    if (!slot) continue;
    if (isParticipantDsqForRound(ref, statusByKey)) {
      const sync = await applyOfficialRowForParticipantDsq(tx, {
        competitionId: opts.competitionId,
        eventId: opts.eventId,
        round: opts.round,
        heatIndex: opts.heatIndex,
        lane: slot.lane,
        participant: ref,
        reason: null,
      });
      if (sync.officialSyncSkipped) skipped = true;
    }
  }

  const dsqRows = await tx.officialResultRow.findMany({
    where: {
      officialResultId: ensured.officialResultId,
      heat: opts.heatIndex,
      status: "DSQ",
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

  for (const row of dsqRows) {
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
    if (!isParticipantDsqForRound(ref, statusByKey)) {
      if (isDsqOnlyOfficialRow(row)) {
        await tx.officialResultRow.delete({ where: { id: row.id } });
      }
    }
  }

  return { officialSyncSkipped: skipped };
}

/** 公式結果行はチーム単位（構成員行は畳む） */
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

/** スナップショットからヒート・レーンを解決して DSQ 行を同期 */
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
): Promise<OfficialResultDsqSyncResult> {
  const roundData = getRoundDataFromSnapshot(opts.snapshot, opts.eventId, opts.round);
  for (const heat of roundData?.heats ?? []) {
    const slot = resolveMarshalSlotInHeat(heat, opts.participant);
    if (slot) {
      return applyOfficialRowForParticipantDsq(tx, {
        competitionId: opts.competitionId,
        eventId: opts.eventId,
        round: opts.round,
        heatIndex: heat.heatIndex,
        lane: slot.lane,
        participant: opts.participant,
        reason: opts.reason,
      });
    }
  }
  return { officialSyncSkipped: false };
}
