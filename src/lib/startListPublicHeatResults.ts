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
      isFinalized: Boolean(official.publishedAt || official.lockedAt),
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
