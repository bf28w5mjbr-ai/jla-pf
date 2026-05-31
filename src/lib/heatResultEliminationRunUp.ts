import type { ResultRound } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import {
  getHeatFromRoundData,
  getRoundDataFromSnapshot,
  resolveMarshalSlotInHeat,
  type MarshalParticipantRef,
} from "@/lib/heatMarshalFromSnapshot";
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import {
  buildParticipantMarshalDisplayByKeyForRound,
  type ParticipantStatusRowForScope,
} from "@/lib/competitionParticipantStatusScope";
import { effectiveDayOpsStatusForMarshalDisplay } from "@/lib/dayOpsParticipantStatusDisplay";
import {
  computeLiveAdvanceQuotasForFrozenNonFinalTab,
  snapshotRoundForTab,
} from "@/lib/startListEventTabDisplay";
import { parseStartListSettings } from "@/lib/startListSettings";
import { getLiveTabsAligned } from "@/lib/startListEventTabDisplay";
import { normalizeSnapshotRoundKey } from "@/lib/heatMarshalFromSnapshot";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import {
  countCalledMarshalSlotsInHeat,
  fetchParticipantStatusesForMarshalEvent,
} from "@/lib/marshalHeatCalledCount";
import { prisma } from "@/server/db";
import {
  marshalIndividualKey,
  marshalTeamLegacyKey,
  marshalTeamMemberKey,
  resultParticipantKeyFromParts,
} from "@/lib/dayOpsParticipantKeys";
import { isCalledLikeStatus, isTeamFullyCalled } from "@/lib/dayOpsTeamStatus";
import { fetchTeamMembersMapForTeamIds } from "@/lib/teamMarshalExpand";

function participantKeyFromResultRow(r: HeatResultCaptureRow): string | null {
  return resultParticipantKeyFromParts(r.entryType, r.competitionEntryId, r.teamEntryId);
}

export type HeatResultRowCounts = {
  rankedCount: number;
  runUpCount: number;
  okCount: number;
};

export function countHeatResultRows(
  rows: ReadonlyArray<Pick<HeatResultCaptureRow, "heat" | "rank" | "advanceWithoutRank">>,
  heatIndex1Based: number
): HeatResultRowCounts {
  let rankedCount = 0;
  let runUpCount = 0;
  let okCount = 0;
  for (const r of rows) {
    if (r.heat !== heatIndex1Based) continue;
    okCount += 1;
    if (r.advanceWithoutRank) {
      runUpCount += 1;
    } else if (r.rank != null) {
      rankedCount += 1;
    }
  }
  return { rankedCount, runUpCount, okCount };
}

export function heatUsesEliminationRunUp(
  rows: ReadonlyArray<Pick<HeatResultCaptureRow, "heat" | "advanceWithoutRank">>,
  heatIndex1Based: number
): boolean {
  return rows.some((r) => r.heat === heatIndex1Based && Boolean(r.advanceWithoutRank));
}

export function eliminationSlots(params: {
  called: number;
  quota: number | null;
}): { eliminationTarget: number; runUpTarget: number } | null {
  const { called, quota } = params;
  if (quota == null || called <= 0 || quota < 0) return null;
  const runUpTarget = Math.min(quota, called);
  const eliminationTarget = Math.max(0, called - runUpTarget);
  return { eliminationTarget, runUpTarget };
}

export function canApplyRunUp(params: {
  called: number;
  quota: number | null;
  rankedCount: number;
  runUpCount: number;
  resultDraftCount?: number;
}): boolean {
  const slots = eliminationSlots({ called: params.called, quota: params.quota });
  if (!slots) return false;
  const draft = params.resultDraftCount ?? 0;
  if (params.rankedCount + draft < slots.eliminationTarget) return false;
  const remainingToRunUp = slots.runUpTarget - params.runUpCount;
  if (remainingToRunUp <= 0) return false;
  const unrecorded =
    params.called - params.rankedCount - params.runUpCount - draft;
  return unrecorded >= remainingToRunUp;
}

export function isEliminationStyleResultInput(
  quota: number | null | undefined,
  inputOrder: "asc" | "desc"
): boolean {
  return inputOrder === "desc" && quota != null;
}

export function isHeatResultReadyForConfirm(params: {
  called: number;
  quota: number | null;
  rankedCount: number;
  runUpCount: number;
  resultDraftCount: number;
  usesElimination: boolean;
}): boolean {
  if (params.called <= 0) return true;
  const draft = params.resultDraftCount;
  if (params.usesElimination) {
    const slots = eliminationSlots({ called: params.called, quota: params.quota });
    if (!slots) return false;
    return (
      params.rankedCount + draft >= slots.eliminationTarget &&
      params.runUpCount >= slots.runUpTarget &&
      params.rankedCount + params.runUpCount + draft >= params.called
    );
  }
  return params.rankedCount + draft >= params.called;
}

export async function resolveAdvanceQuotaForHeatInDayOps(opts: {
  competitionId: string;
  eventId: string;
  round: ResultRound;
  heatIndex: number;
  /** 呼び出し元で既に読み込んでいる場合は渡す（$transaction 内の二重接続を避ける） */
  snapshot?: StartListSnapshotPayload | null;
}): Promise<number | null> {
  const { competitionId, eventId, round, heatIndex } = opts;
  const snapshotPromise =
    opts.snapshot !== undefined
      ? Promise.resolve(opts.snapshot)
      : loadStartListSnapshotPayload(competitionId);
  const [competition, event, snapshot] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: { startListSettings: true },
    }),
    prisma.event.findUnique({
      where: { id: eventId, competitionId },
      select: {
        preliminaryHeatLaneCount: true,
        startListRoundCount: true,
        startListHeatPlanConfirmedAt: true,
      },
    }),
    snapshotPromise,
  ]);
  if (!event?.startListHeatPlanConfirmedAt || !snapshot) return null;

  const roundData = getRoundDataFromSnapshot(snapshot, eventId, round);
  if (!roundData?.heats?.length) return null;

  const heatsSorted = [...roundData.heats].sort((a, b) => a.heatIndex - b.heatIndex);
  const heatIdx = heatsSorted.findIndex((h) => h.heatIndex === heatIndex);
  if (heatIdx < 0) return null;

  const { eventSettings } = parseStartListSettings(competition?.startListSettings);
  const heatSetting = eventSettings[eventId] ?? {};
  const liveTabs = getLiveTabsAligned(heatSetting, event.startListRoundCount);
  const tabCount = Math.max(1, liveTabs.length);
  let tabIndex = -1;
  for (let i = 0; i < tabCount; i += 1) {
    if (snapshotRoundForTab(i, tabCount) === round) {
      tabIndex = i;
      break;
    }
  }
  if (tabIndex < 0) return null;

  const heatSizes = heatsSorted.map((h) => h.participants.length);
  const totalParticipants = heatSizes.reduce((a, b) => a + b, 0);
  const snapshotRound = normalizeSnapshotRoundKey(roundData.round) ?? round;
  const quotas = computeLiveAdvanceQuotasForFrozenNonFinalTab({
    snapshotRound,
    tabIndex,
    tabCount,
    heatSizes,
    totalParticipants,
    liveTabs,
    preliminaryHeatLaneCount: event.preliminaryHeatLaneCount,
    eventHeatSetting: heatSetting,
  });
  if (!quotas) return null;
  const q = quotas[heatIdx];
  return typeof q === "number" ? q : null;
}

export type CalledSlotMissingResult = {
  target: MarshalParticipantRef;
  lane: number;
};

export async function listCalledSlotsMissingOkResultRow(opts: {
  tx: Prisma.TransactionClient;
  competitionId: string;
  eventId: string;
  round: ResultRound;
  heatIndex: number;
  officialResultId: string;
  snapshot: StartListSnapshotPayload | null;
  /** 同一 TX 内で既に読んだ場合は渡す */
  statusRows?: ParticipantStatusRowForScope[];
  /** statusRows 渡し時は省略可（未指定なら DB から取得） */
  heatMarshalCallClosed?: boolean;
}): Promise<CalledSlotMissingResult[]> {
  const roundData = getRoundDataFromSnapshot(opts.snapshot, opts.eventId, opts.round);
  const heat = getHeatFromRoundData(roundData, opts.heatIndex);
  if (!heat) return [];

  const statusesPromise =
    opts.statusRows !== undefined
      ? Promise.resolve(opts.statusRows)
      : fetchParticipantStatusesForMarshalEvent(opts.tx, opts.competitionId, opts.eventId);

  let heatMarshalCallClosed = opts.heatMarshalCallClosed;
  const statuses = await (async () => {
    if (heatMarshalCallClosed !== undefined) {
      return statusesPromise;
    }
    const [marshalRow, rows] = await Promise.all([
      opts.tx.competitionHeatMarshalState.findUnique({
        where: {
          competitionId_eventId_round_heatIndex: {
            competitionId: opts.competitionId,
            eventId: opts.eventId,
            round: opts.round,
            heatIndex: opts.heatIndex,
          },
        },
        select: { callClosedAt: true },
      }),
      statusesPromise,
    ]);
    heatMarshalCallClosed = Boolean(marshalRow?.callClosedAt);
    return rows;
  })();
  const callClosed = heatMarshalCallClosed ?? false;
  const statusByKey = buildParticipantMarshalDisplayByKeyForRound(statuses, opts.round);

  const existingRows = await opts.tx.officialResultRow.findMany({
    where: {
      officialResultId: opts.officialResultId,
      heat: opts.heatIndex,
      status: "OK",
    },
    select: {
      entryType: true,
      competitionEntryId: true,
      teamEntryId: true,
      rank: true,
      advanceWithoutRank: true,
    },
  });
  const hasRow = new Set<string>();
  for (const r of existingRows) {
    if (r.entryType === "INDIVIDUAL" && r.competitionEntryId) {
      hasRow.add(marshalIndividualKey(r.competitionEntryId));
    } else if (r.entryType === "TEAM" && r.teamEntryId) {
      hasRow.add(marshalTeamLegacyKey(r.teamEntryId));
    }
  }

  const teamIds = new Set<string>();
  for (const p of heat.participants ?? []) {
    if (p.kind === "TEAM" && p.teamEntryId) teamIds.add(p.teamEntryId);
  }
  const teamMembersByTeamId = await fetchTeamMembersMapForTeamIds(opts.tx, [...teamIds]);

  const calledCount = countCalledMarshalSlotsInHeat({
    heatMarshalCallClosed: callClosed,
    heat,
    statusByKey,
    teamMembersByTeamId,
  });
  if (calledCount <= 0) return [];

  const out: CalledSlotMissingResult[] = [];
  for (const p of heat.participants ?? []) {
    if (p.kind === "INDIVIDUAL") {
      const st = statusByKey.get(marshalIndividualKey(p.entryId));
      const stored = st?.status ?? "PENDING";
      const eff = effectiveDayOpsStatusForMarshalDisplay(stored, callClosed);
      if (!isCalledLikeStatus(eff)) continue;
      const key = marshalIndividualKey(p.entryId);
      if (hasRow.has(key)) continue;
      const target: MarshalParticipantRef = {
        participantType: "INDIVIDUAL",
        competitionEntryId: p.entryId,
        teamEntryId: null,
      };
      const slot = resolveMarshalSlotInHeat(heat, target);
      if (!slot) continue;
      out.push({ target, lane: slot.lane });
      continue;
    }
    if (p.kind === "TEAM" && p.teamEntryId) {
      const members = teamMembersByTeamId.get(p.teamEntryId) ?? [];
      let teamCalled = false;
      if (members.length === 0) {
        const st = statusByKey.get(marshalTeamLegacyKey(p.teamEntryId));
        const stored = st?.status ?? "PENDING";
        const eff = effectiveDayOpsStatusForMarshalDisplay(stored, callClosed);
        teamCalled = isCalledLikeStatus(eff);
      } else {
        const statuses = members.map((mem) => {
          const st = statusByKey.get(marshalTeamMemberKey(p.teamEntryId, mem.userId));
          const stored = st?.status ?? "PENDING";
          return effectiveDayOpsStatusForMarshalDisplay(stored, callClosed);
        });
        teamCalled = isTeamFullyCalled(statuses);
      }
      if (!teamCalled) continue;
      const key = marshalTeamLegacyKey(p.teamEntryId);
      if (hasRow.has(key)) continue;
      const target: MarshalParticipantRef = {
        participantType: "TEAM",
        competitionEntryId: null,
        teamEntryId: p.teamEntryId,
      };
      const slot = resolveMarshalSlotInHeat(heat, target);
      if (!slot) continue;
      out.push({ target, lane: slot.lane });
    }
  }
  return out;
}

export function participantHasRunUpRow(
  rows: ReadonlyArray<HeatResultCaptureRow>,
  heatIndex: number,
  participantKey: string
): boolean {
  return rows.some((r) => {
    if (r.heat !== heatIndex || !r.advanceWithoutRank) return false;
    const k = participantKeyFromResultRow(r);
    return k === participantKey;
  });
}

export function validateHeatResultConfirmInTransaction(params: {
  calledInHeat: number;
  quota: number | null;
  rows: ReadonlyArray<{
    rank: number | null;
    advanceWithoutRank: boolean;
  }>;
}): { ok: true } | { ok: false; code: string } {
  const { calledInHeat, quota, rows } = params;
  if (calledInHeat <= 0) return { ok: true };

  let rankedCount = 0;
  let runUpCount = 0;
  for (const r of rows) {
    if (r.advanceWithoutRank) {
      if (r.rank != null) return { ok: false, code: "RUN_UP_MUST_HAVE_NULL_RANK" };
      runUpCount += 1;
    } else if (r.rank != null) {
      rankedCount += 1;
    }
  }

  const slots = eliminationSlots({ called: calledInHeat, quota });
  const usesElimination =
    runUpCount > 0 ||
    Boolean(
      slots &&
        rankedCount >= slots.eliminationTarget &&
        rankedCount + runUpCount < calledInHeat
    );
  if (usesElimination && slots) {
    if (!slots) return { ok: false, code: "ELIMINATION_QUOTA_UNKNOWN" };
    if (rankedCount < slots.eliminationTarget) {
      return { ok: false, code: "HEAT_RESULT_INCOMPLETE_ELIMINATION" };
    }
    if (runUpCount < slots.runUpTarget) {
      return { ok: false, code: "HEAT_RESULT_INCOMPLETE_RUN_UP" };
    }
    if (rankedCount + runUpCount < calledInHeat) {
      return { ok: false, code: "HEAT_RESULT_INCOMPLETE_ELIMINATION_OR_RUN_UP" };
    }
    if (runUpCount > slots.runUpTarget) {
      return { ok: false, code: "RUN_UP_EXCEEDS_QUOTA" };
    }
    return { ok: true };
  }

  const okCount = rankedCount + runUpCount;
  if (okCount < calledInHeat) {
    return { ok: false, code: "HEAT_RESULT_INCOMPLETE_RANKS" };
  }
  return { ok: true };
}
