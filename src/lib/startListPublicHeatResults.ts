import type { Prisma, ResultRound, ResultStatus } from "@prisma/client";
import { resultParticipantKeyFromParts } from "@/lib/dayOpsParticipantKeys";
import { prisma } from "@/server/db";

export type PublicHeatResultRowOverlay = {
  rank: number | null;
  status: ResultStatus;
  advanceWithoutRank: boolean;
};

export type PublicHeatResultRoundOverlay = {
  round: ResultRound;
  isFinalized: boolean;
  confirmedHeatIndices: number[];
  rowsByKey: Record<string, PublicHeatResultRowOverlay>;
};

type OfficialResultForOverlay = {
  round: ResultRound;
  publishedAt: Date | null;
  lockedAt: Date | null;
  heatConfirmations: { heat: number }[];
  rows: {
    entryType: "INDIVIDUAL" | "TEAM";
    competitionEntryId: string | null;
    teamEntryId: string | null;
    rank: number | null;
    status: ResultStatus;
    advanceWithoutRank: boolean;
    heat: number | null;
  }[];
};

export function officialResultRowParticipantKey(row: {
  entryType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
}): string | null {
  return resultParticipantKeyFromParts(row.entryType, row.competitionEntryId, row.teamEntryId);
}

/** 公開オーバーレイ: ヒート番号 + 参加者キー（スナップショットのヒートと一致する行のみ表示） */
export function publicHeatResultOverlayKey(heatIndex: number, participantKey: string): string {
  return `${heatIndex}:${participantKey}`;
}

/** 確定ヒートのみを overlay に含める（単体テスト用の純関数） */
export function buildPublicHeatResultRoundOverlays(
  officialResults: OfficialResultForOverlay[]
): PublicHeatResultRoundOverlay[] {
  const overlays: PublicHeatResultRoundOverlay[] = [];

  for (const official of officialResults) {
    const confirmedHeatIndices = [
      ...new Set(
        official.heatConfirmations
          .map((c) => c.heat)
          .filter((h) => Number.isInteger(h) && h >= 1)
      ),
    ].sort((a, b) => a - b);

    if (confirmedHeatIndices.length === 0) continue;

    const confirmedSet = new Set(confirmedHeatIndices);
    const rowsByKey: Record<string, PublicHeatResultRowOverlay> = {};

    for (const row of official.rows) {
      if (row.heat == null || !confirmedSet.has(row.heat)) continue;
      const key = officialResultRowParticipantKey(row);
      if (!key) continue;
      rowsByKey[publicHeatResultOverlayKey(row.heat, key)] = {
        rank: row.rank,
        status: row.status,
        advanceWithoutRank: row.advanceWithoutRank,
      };
    }

    overlays.push({
      round: official.round,
      isFinalized: Boolean(official.lockedAt),
      confirmedHeatIndices,
      rowsByKey,
    });
  }

  return overlays;
}

const officialResultOverlaySelect = {
  round: true,
  publishedAt: true,
  lockedAt: true,
  heatConfirmations: { select: { heat: true } },
  rows: {
    select: {
      entryType: true,
      competitionEntryId: true,
      teamEntryId: true,
      rank: true,
      status: true,
      advanceWithoutRank: true,
      heat: true,
    },
  },
} satisfies Prisma.OfficialResultSelect;

export async function loadPublicHeatResultOverlaysForEvent(
  competitionId: string,
  eventId: string
): Promise<PublicHeatResultRoundOverlay[]> {
  const officialResults = await prisma.officialResult.findMany({
    where: { competitionId, eventId },
    select: officialResultOverlaySelect,
    orderBy: { round: "asc" },
  });

  return buildPublicHeatResultRoundOverlays(officialResults);
}

/** スタートリスト refresh 判定用: 大会内の公式結果・ヒート確定の最新更新時刻 */
export async function loadOfficialResultsRevisionIso(
  competitionId: string
): Promise<string | null> {
  const [heatConfirmedAgg, rowAgg, resultAgg] = await Promise.all([
    prisma.officialResultHeatConfirmed.aggregate({
      _max: { confirmedAt: true },
      where: { officialResult: { competitionId } },
    }),
    prisma.officialResultRow.aggregate({
      _max: { updatedAt: true },
      where: { officialResult: { competitionId } },
    }),
    prisma.officialResult.aggregate({
      _max: { updatedAt: true },
      where: { competitionId },
    }),
  ]);

  const candidates = [
    heatConfirmedAgg._max.confirmedAt,
    rowAgg._max.updatedAt,
    resultAgg._max.updatedAt,
  ].filter((d): d is Date => d instanceof Date);

  if (candidates.length === 0) return null;

  const max = candidates.reduce((a, b) => (a > b ? a : b));
  return max.toISOString();
}

export function publicHeatResultStatusLabelJa(status: ResultStatus): string {
  switch (status) {
    case "DNS":
      return "DNS";
    case "DNF":
      return "DNF";
    case "DSQ":
      return "DSQ";
    case "WITHDRAWN":
      return "棄権";
    default:
      return "OK";
  }
}

export function formatPublicHeatResultOverlayLabel(row: PublicHeatResultRowOverlay): string | null {
  if (row.status !== "OK") {
    return publicHeatResultStatusLabelJa(row.status);
  }
  if (row.advanceWithoutRank) {
    return "進出";
  }
  if (row.rank != null && Number.isFinite(row.rank)) {
    return `${row.rank}位`;
  }
  return null;
}

/** 運用側 panelHelpers の確定後ソート（進出→着順→DNF→ターミナル）と同等 */
export function publicConfirmedResultSortTier(
  row: PublicHeatResultRowOverlay | undefined
): 0 | 1 | 2 | 3 {
  if (row?.advanceWithoutRank) return 0;
  if (row?.rank != null) return 1;
  if (row?.status === "DNF") return 2;
  return 3;
}

function overlayRowForParticipantKey(
  overlay: PublicHeatResultRoundOverlay,
  heatIndex: number,
  participantKey: string | null
): PublicHeatResultRowOverlay | undefined {
  if (!participantKey) return undefined;
  return overlay.rowsByKey[publicHeatResultOverlayKey(heatIndex, participantKey)];
}

/** @internal テスト用 */
export function compareSnapshotParticipantsForConfirmedOverlay(
  heatIndex: number,
  overlay: PublicHeatResultRoundOverlay,
  keyA: string | null,
  keyB: string | null,
  snapshotIndexA: number,
  snapshotIndexB: number
): number {
  const rowA = overlayRowForParticipantKey(overlay, heatIndex, keyA);
  const rowB = overlayRowForParticipantKey(overlay, heatIndex, keyB);
  const tierA = publicConfirmedResultSortTier(rowA);
  const tierB = publicConfirmedResultSortTier(rowB);
  if (tierA !== tierB) return tierA - tierB;

  if (tierA === 0) {
    return snapshotIndexA - snapshotIndexB || (keyA ?? "").localeCompare(keyB ?? "");
  }
  if (tierA === 1) {
    const rankA = rowA?.rank ?? 100_000;
    const rankB = rowB?.rank ?? 100_000;
    return rankA - rankB || (keyA ?? "").localeCompare(keyB ?? "");
  }
  return snapshotIndexA - snapshotIndexB || (keyA ?? "").localeCompare(keyB ?? "");
}

export function sortSnapshotParticipantsForConfirmedOverlay<T>(
  participants: T[],
  heatIndex: number,
  overlay: PublicHeatResultRoundOverlay,
  keyOf: (participant: T) => string | null
): T[] {
  return sortSnapshotParticipantEntriesForConfirmedOverlay(
    participants.map((participant, snapshotIndex) => ({ participant, snapshotIndex })),
    heatIndex,
    overlay,
    keyOf
  );
}

export function sortSnapshotParticipantEntriesForConfirmedOverlay<T>(
  entries: ReadonlyArray<{ participant: T; snapshotIndex: number }>,
  heatIndex: number,
  overlay: PublicHeatResultRoundOverlay,
  keyOf: (participant: T) => string | null
): T[] {
  return [...entries]
    .sort((a, b) =>
      compareSnapshotParticipantsForConfirmedOverlay(
        heatIndex,
        overlay,
        keyOf(a.participant),
        keyOf(b.participant),
        a.snapshotIndex,
        b.snapshotIndex
      )
    )
    .map(({ participant }) => participant);
}
