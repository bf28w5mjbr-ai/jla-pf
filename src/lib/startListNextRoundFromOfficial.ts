import type { Prisma, ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { loadStartListSnapshotPayloadLoose } from "@/lib/heatMarshalGate";
import {
  getRoundDataFromSnapshot,
  heatIndexMatchesSnapshot,
  parseStartListSnapshotLooseForRoundRead,
} from "@/lib/heatMarshalFromSnapshot";
import {
  normalizeRoundTabs,
  parseStartListSettings,
  resolveHeatCountForSnapshotTransition,
  resolveMaxLanesForSnapshotTransition,
  type HeatSetting,
} from "@/lib/startListSettings";
import {
  dedupeOfficialResultRowsForAdvance,
  filterHeatOfficialRowsForNextRoundAdvance,
  groupOfficialRowsByResolvedHeatAndSnapshotOrder,
  resolveOfficialRowHeatBucketKey,
} from "@/lib/startListAdvanceEligibility";
import {
  computePrevRoundOfficialFingerprint,
  isNextRoundMarshalStarted,
  storedFingerprintForNextRoundBlock,
} from "@/lib/startListNextRoundFingerprint";
import {
  maxPriorHeatCloseAtForRound,
  reconcileNextRoundMarshalAfterRescueRegenerate,
  snapshotNextRoundMarshalStatuses,
} from "@/lib/startListNextRoundRescue";
import { computePlacementSeed } from "@/lib/startListHeatPlacement";
import { createStartListSnapshotIfNeeded } from "@/lib/startListSnapshot";
import {
  buildNextRoundHeatsFromPreviousResults,
  collectAdvancersPerHeatMixed,
  computeAdvanceCountsByLaneSlotsPerHeat,
  countStartListParticipantsBySourceHeat,
  enforceMinHeatCountForMaxLanes,
  mergeSnapshotRoundsWithNextRoundAndAdvanceQuotas,
  reorderRounds,
  totalAdvanceCapacityFromNextRoundLayout,
  type StartListParticipant,
  type StartListRound,
  type StartListRoundData,
} from "@/lib/startListRounds";

type SnapshotEvent = {
  eventId: string;
  name: string;
  sex: "MALE" | "FEMALE" | "OTHER";
  type: "INDIVIDUAL" | "TEAM";
  rounds?: StartListRoundData[];
};

type SnapshotData = {
  version?: number;
  capturedAt?: string;
  events?: SnapshotEvent[];
};

const officialInclude = {
  rows: {
    where: { status: "OK" as const },
    include: {
      competitionEntry: {
        include: {
          user: {
            select: { id: true, profile: { select: { familyName: true, givenName: true } } },
          },
          club: {
            select: { id: true, name: true },
          },
        },
      },
      teamEntry: {
        include: {
          club: { select: { id: true, name: true } },
          members: {
            include: {
              user: {
                select: { profile: { select: { familyName: true, givenName: true } } },
              },
            },
            orderBy: { order: "asc" as const },
          },
        },
      },
    },
    orderBy: [{ heat: "asc" as const }, { rank: "asc" as const }],
  },
} satisfies Prisma.OfficialResultInclude;

export function resolveStartListTabCountForProgression(
  startListRoundCount: number | null | undefined,
  setting: HeatSetting | undefined
): number {
  if (
    typeof startListRoundCount === "number" &&
    Number.isInteger(startListRoundCount) &&
    startListRoundCount >= 1 &&
    startListRoundCount <= 32
  ) {
    return startListRoundCount;
  }
  const tabs = normalizeRoundTabs(setting ?? {});
  return Math.max(1, tabs.length);
}

/** 公式結果が確定したラウンドから、自動で付与する次スナップショットブロック（HEAT→準決勝 or 決勝、SEMI→決勝） */
export function inferAutoNextRoundTransition(params: {
  finishedRound: "HEAT" | "SEMI";
  tabCount: number;
}): { fromRound: "HEAT" | "SEMI"; toRound: "SEMI" | "FINAL" } | null {
  const { finishedRound, tabCount } = params;
  if (finishedRound === "SEMI") {
    return { fromRound: "SEMI", toRound: "FINAL" };
  }
  if (tabCount <= 1) return null;
  if (tabCount === 2) {
    return { fromRound: "HEAT", toRound: "FINAL" };
  }
  return { fromRound: "HEAT", toRound: "SEMI" };
}

export type AutoAppendNextStartListRoundResult =
  | { ok: true; skipped: false; toRound: StartListRound; participantCount: number; heatCount: number }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

type AdvanceSelectionRow = {
  entryType: string;
  teamEntryId: string | null;
  teamEntry?: { id: string } | null;
};

/**
 * 公式結果から次ラ進出が確定しているチーム ID（メンバー割当の編集可否用）。
 * 次ラスナップショット未生成でも、進出者は予選マーシャル締切後に割当を直せる。
 */
export async function teamEntryIdsSelectedForNextRoundAdvanceFromOfficial(params: {
  competitionId: string;
  eventId: string;
  fromRound: ResultRound;
}): Promise<Set<string>> {
  const { competitionId, eventId, fromRound } = params;
  if (fromRound === "FINAL") return new Set();

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      startListSettings: true,
      events: {
        where: { id: eventId },
        select: {
          id: true,
          preliminaryHeatLaneCount: true,
          startListRoundCount: true,
        },
      },
    },
  });
  const event = competition?.events[0];
  if (!event) return new Set();

  const eventSettings = parseStartListSettings(competition!.startListSettings).eventSettings;
  const eventSetting = eventSettings[eventId];
  const tabCount = resolveStartListTabCountForProgression(event.startListRoundCount, eventSetting);
  const transition = inferAutoNextRoundTransition({
    finishedRound: fromRound,
    tabCount,
  });
  if (!transition || transition.fromRound !== fromRound) return new Set();
  const { toRound } = transition;

  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: {
        competitionId,
        eventId,
        round: fromRound,
      },
    },
    include: officialInclude,
  });
  if (!official?.rows.length) return new Set();

  const roundLocked = Boolean(official.lockedAt);
  if (!roundLocked) {
    const allHeatsConfirmed = await areAllSnapshotHeatsResultConfirmed({
      competitionId,
      eventId,
      round: fromRound,
      officialResultId: official.id,
    });
    if (!allHeatsConfirmed) return new Set();
  }

  const snapshotPayload = await loadStartListSnapshotPayloadLoose(competitionId);
  const rowsForAdvance = dedupeOfficialResultRowsForAdvance(official.rows);
  const heatEntriesRaw = groupOfficialRowsByResolvedHeatAndSnapshotOrder(
    rowsForAdvance,
    snapshotPayload,
    eventId,
    fromRound
  );
  const heatEntries = await filterHeatOfficialRowsForNextRoundAdvance(
    { competitionId, eventId, fromRound },
    heatEntriesRaw
  );
  const sourceHeatSizes = heatEntries.map(([, rows]) => rows.length);
  const totalInRound = sourceHeatSizes.reduce((a, b) => a + b, 0);
  if (totalInRound === 0) return new Set();

  const nextHeatCountForCapacity = resolveHeatCountForSnapshotTransition({
    setting: eventSetting,
    participantTotal: totalInRound,
    fromRound,
    toRound,
  });
  const maxLanes = resolveMaxLanesForSnapshotTransition({
    setting: eventSetting,
    eventDefaultLanes: event.preliminaryHeatLaneCount,
    fromRound,
    toRound,
  });
  if (typeof maxLanes !== "number" || !Number.isFinite(maxLanes) || maxLanes < 1) {
    return new Set();
  }

  const capacity = totalAdvanceCapacityFromNextRoundLayout(
    nextHeatCountForCapacity,
    maxLanes,
    totalInRound
  );
  const advancePerHeat = computeAdvanceCountsByLaneSlotsPerHeat(
    heatEntries.length,
    maxLanes,
    capacity
  );
  const selectedRows = collectAdvancersPerHeatMixed(heatEntries, advancePerHeat);

  const out = new Set<string>();
  for (const row of selectedRows as AdvanceSelectionRow[]) {
    if (row.entryType !== "TEAM") continue;
    const id = row.teamEntryId ?? row.teamEntry?.id;
    if (id) out.add(id);
  }
  return out;
}

/**
 * 次ラウンド生成の前提: 種目の公式結果がラウンド単位でロック済み、または
 * スナップショット上の当該ラウンドの全ヒートがリザルト確定（OfficialResultHeatConfirmed）済み。
 */
export async function areAllSnapshotHeatsResultConfirmed(params: {
  competitionId: string;
  eventId: string;
  round: ResultRound;
  officialResultId: string;
}): Promise<boolean> {
  const snapshot = await loadStartListSnapshotPayloadLoose(params.competitionId);
  if (!snapshot) return false;
  const roundData = getRoundDataFromSnapshot(snapshot, params.eventId, params.round);
  const heats = roundData?.heats ?? [];
  if (heats.length === 0) return false;
  const needed = [
    ...new Set(
      heats
        .map((h) => Number(h.heatIndex))
        .filter((n) => Number.isFinite(n) && n >= 1)
    ),
  ];
  if (needed.length === 0) return false;
  const confirmed = await prisma.officialResultHeatConfirmed.findMany({
    where: { officialResultId: params.officialResultId },
    select: { heat: true },
  });
  const confirmedHeats = confirmed.map((c) => c.heat);
  return needed.every((h) => confirmedHeats.some((c) => heatIndexMatchesSnapshot(h, c)));
}

/** 次ラ SL 生成・再生成をブロックする toRound 側の公式結果状態 */
export async function hasToRoundBlockingOfficialResults(params: {
  competitionId: string;
  eventId: string;
  toRound: ResultRound;
}): Promise<boolean> {
  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: {
        competitionId: params.competitionId,
        eventId: params.eventId,
        round: params.toRound,
      },
    },
    select: {
      lockedAt: true,
      heatConfirmations: { select: { id: true }, take: 1 },
      rows: { where: { heat: { not: null } }, select: { id: true }, take: 1 },
    },
  });
  if (!official) return false;
  if (official.lockedAt) return true;
  if (official.heatConfirmations.length > 0) return true;
  if (official.rows.length > 0) return true;
  return false;
}

export type GenerateNextRoundSlMode = "create" | "regenerate" | "rescue";

export type GenerateNextRoundStartListResult =
  | {
      ok: true;
      toRound: StartListRound;
      participantCount: number;
      heatCount: number;
      fingerprint: string;
    }
  | { ok: false; error: string; code?: string };

export type NextRoundSlStatus = {
  fromRound: "HEAT" | "SEMI";
  toRound: "SEMI" | "FINAL";
  allHeatsConfirmed: boolean;
  nextRoundExists: boolean;
  marshalStarted: boolean;
  toRoundHasBlockingOfficialResults: boolean;
  currentFingerprint: string | null;
  storedFingerprint: string | null;
  fingerprintMatches: boolean;
  canGenerate: boolean;
  canRegenerate: boolean;
  canRescueRegenerate: boolean;
  blockedReason: string | null;
};

export async function evaluateNextRoundSlStatus(params: {
  competitionId: string;
  eventId: string;
  fromRound: "HEAT" | "SEMI";
}): Promise<NextRoundSlStatus | { error: string }> {
  const { competitionId, eventId, fromRound } = params;

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      startListSettings: true,
      events: {
        where: { id: eventId },
        select: { startListRoundCount: true },
      },
    },
  });
  const event = competition?.events[0];
  if (!event) return { error: "EVENT_NOT_FOUND" };

  const eventSettings = parseStartListSettings(competition!.startListSettings).eventSettings;
  const tabCount = resolveStartListTabCountForProgression(event.startListRoundCount, eventSettings[eventId]);
  const transition = inferAutoNextRoundTransition({ finishedRound: fromRound, tabCount });
  if (!transition || transition.fromRound !== fromRound) {
    return { error: "NO_NEXT_ROUND_FOR_TAB_COUNT" };
  }
  const { toRound } = transition;

  const toRoundHasBlockingOfficialResults = await hasToRoundBlockingOfficialResults({
    competitionId,
    eventId,
    toRound,
  });

  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: { competitionId, eventId, round: fromRound },
    },
    select: { id: true },
  });

  const allHeatsConfirmed = official
    ? await areAllSnapshotHeatsResultConfirmed({
        competitionId,
        eventId,
        round: fromRound,
        officialResultId: official.id,
      })
    : false;

  const snapshot = await loadStartListSnapshotPayloadLoose(competitionId);
  const nextBlock = getRoundDataFromSnapshot(snapshot, eventId, toRound);
  const nextRoundExists = Boolean(nextBlock?.heats?.length && nextBlock.generatedBy === "RESULT_BASED");

  const currentFingerprint = await computePrevRoundOfficialFingerprint({
    competitionId,
    eventId,
    fromRound,
  });
  const storedFingerprint = storedFingerprintForNextRoundBlock(nextBlock);
  const fingerprintMatches =
    currentFingerprint != null &&
    storedFingerprint != null &&
    currentFingerprint === storedFingerprint;

  const marshalStarted = nextRoundExists
    ? await isNextRoundMarshalStarted({ competitionId, eventId, toRound })
    : false;

  let blockedReason: string | null = null;
  let canGenerate = false;
  let canRegenerate = false;
  let canRescueRegenerate = false;

  if (toRoundHasBlockingOfficialResults) {
    blockedReason =
      "次ラウンドでリザルト入力または確定済みのヒートがあるため、SL を生成・再生成できません";
  } else if (!allHeatsConfirmed) {
    blockedReason = "前ラウンドの全ヒートがリザルト確定するまで SL を生成できません";
  } else if (!currentFingerprint) {
    blockedReason = "前ラウンドの公式結果がありません";
  } else if (!nextRoundExists) {
    canGenerate = true;
  } else if (fingerprintMatches) {
    blockedReason = "前ラ結果に変更がないため、SL は最新です";
  } else if (!marshalStarted) {
    canRegenerate = true;
  } else {
    canRescueRegenerate = true;
  }

  return {
    fromRound,
    toRound,
    allHeatsConfirmed,
    nextRoundExists,
    marshalStarted,
    toRoundHasBlockingOfficialResults,
    currentFingerprint,
    storedFingerprint,
    fingerprintMatches,
    canGenerate,
    canRegenerate,
    canRescueRegenerate,
    blockedReason,
  };
}

export async function generateNextRoundStartListFromOfficial(params: {
  competitionId: string;
  eventId: string;
  fromRound: "HEAT" | "SEMI";
  mode: GenerateNextRoundSlMode;
  operatorUserId?: string | null;
}): Promise<GenerateNextRoundStartListResult> {
  const { competitionId, eventId, fromRound, mode, operatorUserId = null } = params;

  const status = await evaluateNextRoundSlStatus({ competitionId, eventId, fromRound });
  if ("error" in status) {
    return { ok: false, error: status.error, code: status.error };
  }

  if (mode === "create" && !status.canGenerate) {
    return { ok: false, error: status.blockedReason ?? "SL を生成できません", code: "CANNOT_CREATE" };
  }
  if (mode === "regenerate" && !status.canRegenerate) {
    return { ok: false, error: status.blockedReason ?? "SL を再生成できません", code: "CANNOT_REGENERATE" };
  }
  if (mode === "rescue" && !status.canRescueRegenerate) {
    return {
      ok: false,
      error: status.blockedReason ?? "救済再生成できません",
      code: "CANNOT_RESCUE",
    };
  }

  const { toRound } = status;
  const fingerprint =
    status.currentFingerprint ??
    (await computePrevRoundOfficialFingerprint({ competitionId, eventId, fromRound }));
  if (!fingerprint) {
    return { ok: false, error: "前ラウンドの公式結果がありません", code: "NO_OFFICIAL" };
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      startListSettings: true,
      events: {
        where: { id: eventId },
        select: {
          id: true,
          name: true,
          sex: true,
          type: true,
          preliminaryHeatLaneCount: true,
          startListRoundCount: true,
        },
      },
    },
  });
  if (!competition?.events[0]) {
    return { ok: false, error: "EVENT_NOT_FOUND", code: "EVENT_NOT_FOUND" };
  }
  const event = competition.events[0];
  const eventSettings = parseStartListSettings(competition.startListSettings).eventSettings;
  const eventSetting = eventSettings[eventId];

  await createStartListSnapshotIfNeeded({
    competitionId,
    skipPaymentStabilityCheck: true,
    skipEntryDeadlineGate: true,
    firstRoundGeneratedBy: "BASELINE",
  });

  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: { competitionId, eventId, round: fromRound },
    },
    include: officialInclude,
  });
  if (!official?.rows.length) {
    return { ok: false, error: "前ラウンドの公式結果がありません", code: "NO_OFFICIAL_ROWS" };
  }

  const snapshotRow = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId },
    select: { id: true, data: true },
  });
  if (!snapshotRow) {
    return { ok: false, error: "スタートリスト固定データがありません", code: "NO_SNAPSHOT" };
  }

  const snapshotPayload = parseStartListSnapshotLooseForRoundRead(snapshotRow.data);
  const rowsForAdvance = dedupeOfficialResultRowsForAdvance(official.rows);
  const heatEntriesRaw = groupOfficialRowsByResolvedHeatAndSnapshotOrder(
    rowsForAdvance,
    snapshotPayload,
    eventId,
    fromRound
  );
  const heatEntries = await filterHeatOfficialRowsForNextRoundAdvance(
    { competitionId, eventId, fromRound },
    heatEntriesRaw
  );
  const sourceHeatSizes = heatEntries.map(([, rows]) => rows.length);
  const totalInRound = sourceHeatSizes.reduce((a, b) => a + b, 0);

  const nextHeatCountForCapacity = resolveHeatCountForSnapshotTransition({
    setting: eventSetting,
    participantTotal: totalInRound,
    fromRound,
    toRound,
  });

  const maxLanes = resolveMaxLanesForSnapshotTransition({
    setting: eventSetting,
    eventDefaultLanes: event.preliminaryHeatLaneCount,
    fromRound,
    toRound,
  });
  if (typeof maxLanes !== "number" || !Number.isFinite(maxLanes) || maxLanes < 1) {
    return { ok: false, error: "進出枠の設定が不足しています", code: "NEEDS_PRELIMINARY_MAX_LANES" };
  }

  const capacity = totalAdvanceCapacityFromNextRoundLayout(
    nextHeatCountForCapacity,
    maxLanes,
    totalInRound
  );
  const advancePerHeat = computeAdvanceCountsByLaneSlotsPerHeat(heatEntries.length, maxLanes, capacity);
  const selectedRows = collectAdvancersPerHeatMixed(heatEntries, advancePerHeat);

  const participants: StartListParticipant[] = [];
  for (const row of selectedRows) {
    const sourceHeat =
      resolveOfficialRowHeatBucketKey(row, snapshotPayload, eventId, fromRound) ?? row.heat ?? undefined;
    if (row.entryType === "INDIVIDUAL" && row.competitionEntry) {
      participants.push({
        kind: "INDIVIDUAL",
        entryId: row.competitionEntry.id,
        userId: row.competitionEntry.userId,
        name: `${row.competitionEntry.user.profile?.familyName ?? ""} ${row.competitionEntry.user.profile?.givenName ?? ""}`.trim(),
        clubId: row.competitionEntry.club?.id ?? null,
        clubName: row.competitionEntry.club?.name ?? null,
        sourceRank: row.rank,
        sourceHeat,
      });
      continue;
    }
    if (row.entryType === "TEAM" && row.teamEntry) {
      participants.push({
        kind: "TEAM",
        teamEntryId: row.teamEntry.id,
        teamName: row.teamEntry.teamName,
        clubId: row.teamEntry.club?.id ?? null,
        clubName: row.teamEntry.club?.name ?? null,
        members: row.teamEntry.members
          .map((member) => `${member.user.profile?.familyName ?? ""} ${member.user.profile?.givenName ?? ""}`.trim())
          .filter(Boolean),
        sourceRank: row.rank,
        sourceHeat,
      });
    }
  }

  if (participants.length === 0) {
    return { ok: false, error: "次ラウンド生成対象の参加者がいません", code: "NO_ADVANCING_PARTICIPANTS" };
  }

  const heatCountForLayout = enforceMinHeatCountForMaxLanes(
    participants.length,
    nextHeatCountForCapacity,
    maxLanes
  );

  const shuffleFingerprint = [...participants]
    .map((p) => (p.kind === "INDIVIDUAL" ? p.entryId : p.teamEntryId))
    .sort()
    .join(",");
  const shuffleSalt = mode === "create" ? "initial" : String(Date.now());
  const shuffleSeed = computePlacementSeed(
    competitionId,
    eventId,
    `nextRound:${fromRound}>${toRound}:${shuffleFingerprint}:${shuffleSalt}`
  );

  const heats = buildNextRoundHeatsFromPreviousResults({
    participants,
    heatCount: heatCountForLayout,
    shuffleSeed,
  });

  const nextRoundData: StartListRoundData = {
    round: toRound,
    generatedAt: new Date().toISOString(),
    generatedBy: "RESULT_BASED",
    sourceRound: fromRound,
    sourceOfficialFingerprint: fingerprint,
    heats,
  };

  const actualBySourceHeat = countStartListParticipantsBySourceHeat(participants);
  const advanceQuotasByOfficialHeat = heatEntries.map(([heatKey], i) => ({
    heat: heatKey,
    quota: advancePerHeat[i] ?? 0,
    actual: actualBySourceHeat.get(heatKey) ?? 0,
  }));

  const raw = (snapshotRow.data && typeof snapshotRow.data === "object"
    ? (snapshotRow.data as SnapshotData)
    : {}) as SnapshotData;
  const events = Array.isArray(raw.events) ? raw.events : [];

  let touched = false;
  const nextEvents = events.map((item) => {
    if (item.eventId !== eventId) return item;
    touched = true;
    const prevRounds = Array.isArray(item.rounds) ? item.rounds : [];
    return {
      ...item,
      rounds: mergeSnapshotRoundsWithNextRoundAndAdvanceQuotas({
        prevRounds,
        nextRoundData,
        fromRound,
        advanceQuotasByOfficialHeat,
      }),
    };
  });
  if (!touched) {
    nextEvents.push({
      eventId: event.id,
      name: event.name,
      sex: event.sex as "MALE" | "FEMALE" | "OTHER",
      type: event.type as "INDIVIDUAL" | "TEAM",
      rounds: reorderRounds([nextRoundData]),
    });
  }

  const nextSnapshotData = {
    ...(raw ?? {}),
    version: typeof raw.version === "number" ? raw.version : 2,
    events: nextEvents,
  };

  await prisma.$transaction(async (tx) => {
    if (mode === "rescue") {
      const statusBefore = await snapshotNextRoundMarshalStatuses(tx, {
        competitionId,
        eventId,
        toRound,
      });
      const maxPriorHeatCloseAt = await maxPriorHeatCloseAtForRound(tx, {
        competitionId,
        eventId,
        toRound,
      });

      await tx.competitionStartListSnapshot.update({
        where: { id: snapshotRow.id },
        data: { data: nextSnapshotData },
      });

      const updatedPayload = parseStartListSnapshotLooseForRoundRead(nextSnapshotData);
      await reconcileNextRoundMarshalAfterRescueRegenerate(tx, {
        competitionId,
        eventId,
        toRound,
        snapshot: updatedPayload,
        statusBefore,
        maxPriorHeatCloseAt,
        operatorUserId,
        now: new Date(),
      });
    } else {
      await tx.competitionStartListSnapshot.update({
        where: { id: snapshotRow.id },
        data: { data: nextSnapshotData },
      });
    }
  });

  return {
    ok: true,
    toRound,
    participantCount: participants.length,
    heatCount: heats.length,
    fingerprint,
  };
}

/**
 * @deprecated 自動生成廃止。スクリプト互換のため create モードで委譲。
 */
export async function tryAutoAppendNextStartListRound(params: {
  competitionId: string;
  eventId: string;
  finishedRound: "HEAT" | "SEMI";
}): Promise<AutoAppendNextStartListRoundResult> {
  const result = await generateNextRoundStartListFromOfficial({
    competitionId: params.competitionId,
    eventId: params.eventId,
    fromRound: params.finishedRound,
    mode: "create",
  });
  if (!result.ok) {
    if (result.code === "CANNOT_CREATE") {
      return { ok: true, skipped: true, reason: result.error };
    }
    return { ok: false, error: result.error };
  }
  return {
    ok: true,
    skipped: false,
    toRound: result.toRound,
    participantCount: result.participantCount,
    heatCount: result.heatCount,
  };
}
