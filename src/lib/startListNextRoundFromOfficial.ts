import type { Prisma, ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { loadStartListSnapshotPayloadLoose } from "@/lib/heatMarshalGate";
import {
  getRoundDataFromSnapshot,
  parseStartListSnapshotLooseForRoundRead,
} from "@/lib/heatMarshalFromSnapshot";
import {
  normalizeRoundTabs,
  parseStartListSettings,
  resolveHeatCountForSnapshotTransition,
  type HeatSetting,
} from "@/lib/startListSettings";
import {
  dedupeOfficialResultRowsForAdvance,
  filterHeatOfficialRowsForNextRoundAdvance,
  groupOfficialRowsByResolvedHeatAndSnapshotOrder,
  resolveOfficialRowHeatBucketKey,
} from "@/lib/startListAdvanceEligibility";
import { computePlacementSeed } from "@/lib/startListHeatPlacement";
import { createStartListSnapshotIfNeeded } from "@/lib/startListSnapshot";
import {
  buildNextRoundHeatsFromPreviousResults,
  collectAdvancersPerHeatByRank,
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
            select: { id: true, familyName: true, givenName: true },
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
                select: { familyName: true, givenName: true },
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
  const needed = [...new Set(heats.map((h) => h.heatIndex))];
  const confirmed = await prisma.officialResultHeatConfirmed.findMany({
    where: { officialResultId: params.officialResultId },
    select: { heat: true },
  });
  const set = new Set(confirmed.map((c) => c.heat));
  return needed.every((h) => set.has(h));
}

/**
 * 前ラウンドの公式結果が確定したあと、スナップショットに次ラウンドを自動追記する。
 * 進出はラウンド別ヒート数・最大レーンから算出した定員で按分（手動次ラ API と同じ）。
 *
 * 実行条件: （1）当該ラウンドの OfficialResult が lockedAt 付きで確定している、または
 * （2）スタートリストスナップショット上のそのラウンドの全ヒートがヒート単位リザルト確定済み。
 */
export async function tryAutoAppendNextStartListRound(params: {
  competitionId: string;
  eventId: string;
  finishedRound: "HEAT" | "SEMI";
}): Promise<AutoAppendNextStartListRoundResult> {
  const { competitionId, eventId, finishedRound } = params;

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
    return { ok: false, error: "EVENT_NOT_FOUND" };
  }
  const event = competition.events[0];
  const eventSettings = parseStartListSettings(competition.startListSettings).eventSettings;
  const eventSetting = eventSettings[eventId];
  const tabCount = resolveStartListTabCountForProgression(event.startListRoundCount, eventSetting);

  const transition = inferAutoNextRoundTransition({ finishedRound, tabCount });
  if (!transition) {
    return { ok: true, skipped: true, reason: "NO_NEXT_ROUND_FOR_TAB_COUNT" };
  }
  const { fromRound, toRound } = transition;

  if (fromRound === "SEMI" && toRound !== "FINAL") {
    return { ok: false, error: "INVALID_TRANSITION" };
  }

  await createStartListSnapshotIfNeeded({
    competitionId,
    skipPaymentStabilityCheck: true,
    skipEntryDeadlineGate: true,
    firstRoundGeneratedBy: "BASELINE",
  });

  const snapshot = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId },
    select: { id: true, data: true },
  });
  if (!snapshot) {
    return { ok: true, skipped: true, reason: "NO_SNAPSHOT" };
  }

  const raw = (snapshot.data && typeof snapshot.data === "object"
    ? (snapshot.data as SnapshotData)
    : {}) as SnapshotData;
  const events = Array.isArray(raw.events) ? raw.events : [];
  const snapEvent = events.find((e) => e.eventId === eventId);
  const rounds = Array.isArray(snapEvent?.rounds) ? snapEvent!.rounds! : [];
  if (rounds.some((r) => r.round === toRound)) {
    return { ok: true, skipped: true, reason: "ALREADY_HAS_TARGET_ROUND" };
  }

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
  if (!official || official.rows.length === 0) {
    return { ok: true, skipped: true, reason: "NO_OFFICIAL_ROWS" };
  }

  const roundLocked = Boolean(official.lockedAt);
  if (!roundLocked) {
    const allHeatsConfirmed = await areAllSnapshotHeatsResultConfirmed({
      competitionId,
      eventId,
      round: fromRound,
      officialResultId: official.id,
    });
    if (!allHeatsConfirmed) {
      return { ok: true, skipped: true, reason: "WAITING_ALL_HEAT_RESULT_CONFIRMS_OR_ROUND_LOCK" };
    }
  }

  const snapshotPayload = parseStartListSnapshotLooseForRoundRead(snapshot.data);
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

  const maxLanes = event.preliminaryHeatLaneCount;
  if (typeof maxLanes !== "number" || !Number.isFinite(maxLanes) || maxLanes < 1) {
    return { ok: true, skipped: true, reason: "NEEDS_PRELIMINARY_MAX_LANES" };
  }

  const capacity = totalAdvanceCapacityFromNextRoundLayout(
    nextHeatCountForCapacity,
    maxLanes,
    totalInRound
  );
  const advancePerHeat = computeAdvanceCountsByLaneSlotsPerHeat(heatEntries.length, maxLanes, capacity);
  const selectedRows = collectAdvancersPerHeatByRank(heatEntries, advancePerHeat);

  const participants: StartListParticipant[] = [];
  for (const row of selectedRows) {
    const sourceHeat =
      resolveOfficialRowHeatBucketKey(row, snapshotPayload, eventId, fromRound) ?? row.heat ?? undefined;
    if (row.entryType === "INDIVIDUAL" && row.competitionEntry) {
      participants.push({
        kind: "INDIVIDUAL",
        entryId: row.competitionEntry.id,
        userId: row.competitionEntry.userId,
        name: `${row.competitionEntry.user.familyName} ${row.competitionEntry.user.givenName}`,
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
          .map((member) => `${member.user.familyName} ${member.user.givenName}`)
          .filter(Boolean),
        sourceRank: row.rank,
        sourceHeat,
      });
    }
  }

  if (participants.length === 0) {
    return { ok: true, skipped: true, reason: "NO_ADVANCING_PARTICIPANTS" };
  }

  if (participants.length !== selectedRows.length) {
    console.warn(
      `[tryAutoAppendNextStartListRound] selected ${selectedRows.length} official rows but built ${participants.length} participants (check Prisma include)`
    );
  }

  /** 按分アップは {@link nextHeatCountForCapacity}×レーン で決めた総枠に基づく。次ラのヒート数も同じ前提に揃えないとアップ数と実レイアウトが食い違う */
  const heatCountForLayout = enforceMinHeatCountForMaxLanes(
    participants.length,
    nextHeatCountForCapacity,
    maxLanes
  );

  const shuffleFingerprint = [...participants]
    .map((p) => (p.kind === "INDIVIDUAL" ? p.entryId : p.teamEntryId))
    .sort()
    .join(",");
  const shuffleSeed = computePlacementSeed(
    competitionId,
    eventId,
    `nextRound:${fromRound}>${toRound}:${shuffleFingerprint}`
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
    heats,
  };

  const actualBySourceHeat = countStartListParticipantsBySourceHeat(participants);
  const advanceQuotasByOfficialHeat = heatEntries.map(([heatKey], i) => ({
    heat: heatKey,
    quota: advancePerHeat[i] ?? 0,
    actual: actualBySourceHeat.get(heatKey) ?? 0,
  }));

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

  await prisma.competitionStartListSnapshot.update({
    where: { id: snapshot.id },
    data: {
      data: {
        ...(raw ?? {}),
        version: typeof raw.version === "number" ? raw.version : 2,
        events: nextEvents,
      },
    },
  });

  return {
    ok: true,
    skipped: false,
    toRound,
    participantCount: participants.length,
    heatCount: heats.length,
  };
}
