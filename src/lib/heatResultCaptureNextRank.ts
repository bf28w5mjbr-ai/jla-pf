import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

export type HeatOkRankStats = {
  okRowCount: number;
  maxRank: number;
  minRank: number | null;
};

export type LastOkRowRef = {
  id: string;
  rank: number;
  tieGroup: string | null;
};

export function statsFromHeatOkRows(
  rows: ReadonlyArray<{ rank: number | null }>
): HeatOkRankStats {
  let okRowCount = 0;
  let maxRank = 0;
  let minRank: number | null = null;
  for (const row of rows) {
    if (row.rank == null) continue;
    okRowCount += 1;
    maxRank = Math.max(maxRank, row.rank);
    minRank = minRank == null ? row.rank : Math.min(minRank, row.rank);
  }
  return { okRowCount, maxRank, minRank };
}

/** 非同着時の次着順（pure）。 */
export function computeNonTieNextHeatResultRank(params: {
  inputOrder: "asc" | "desc";
  descCalledBaseline: number | null;
  stats: HeatOkRankStats;
}): number {
  const { inputOrder, descCalledBaseline, stats } = params;
  if (inputOrder === "desc") {
    if (stats.okRowCount === 0) {
      return descCalledBaseline ?? 1;
    }
    return Math.max(1, (stats.minRank ?? 1) - 1);
  }
  return stats.maxRank + 1;
}

export type ResolvedHeatResultNextRank = {
  nextRank: number;
  tieGroup: string | null;
  /** 同着グループを後付けする既存行 */
  previousRowTieGroupUpdate: { id: string; tieGroup: string } | null;
};

/**
 * append / confirm batch 共通: 次着順と tieGroup を決定する。
 * batch ループでは `lastOkRowInBatch` を渡し、同一 TX 内の直前行を優先する。
 */
export async function resolveHeatResultNextRank(params: {
  tx: Prisma.TransactionClient;
  officialResultId: string;
  heatIndex: number;
  tieWithPrevious: boolean;
  inputOrder: "asc" | "desc";
  descCalledBaseline: number | null;
  stats: HeatOkRankStats;
  lastOkRowInBatch: LastOkRowRef | null;
}): Promise<ResolvedHeatResultNextRank> {
  const {
    tx,
    officialResultId,
    heatIndex,
    tieWithPrevious,
    inputOrder,
    descCalledBaseline,
    stats,
    lastOkRowInBatch,
  } = params;

  if (tieWithPrevious) {
    const previous =
      lastOkRowInBatch ??
      (await tx.officialResultRow.findFirst({
        where: {
          officialResultId,
          heat: heatIndex,
          status: "OK",
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, rank: true, tieGroup: true },
      }));

    if (!previous || previous.rank == null) {
      throw new Error("TIE_NEEDS_PREVIOUS_RESULT");
    }

    const tieGroup = previous.tieGroup ?? randomUUID();
    return {
      nextRank: previous.rank,
      tieGroup,
      previousRowTieGroupUpdate: previous.tieGroup
        ? null
        : { id: previous.id, tieGroup },
    };
  }

  if (inputOrder === "desc" && descCalledBaseline != null && descCalledBaseline <= 0) {
    throw new Error("DESC_INPUT_NO_CALLED");
  }

  return {
    nextRank: computeNonTieNextHeatResultRank({
      inputOrder,
      descCalledBaseline,
      stats,
    }),
    tieGroup: null,
    previousRowTieGroupUpdate: null,
  };
}

export type ProvisionalDraftRankInput = {
  key: string;
  seq: number;
  tieWithPrevious: boolean;
};

/** 未確定チェックの仮着順（サーバー行 + draftSequence 順）。 */
export function computeProvisionalDraftRanks(params: {
  serverRanks: number[];
  drafts: ProvisionalDraftRankInput[];
  inputOrder: "asc" | "desc";
  calledN: number;
}): Map<string, number> {
  const { serverRanks, drafts, inputOrder, calledN } = params;
  const keyToRank = new Map<string, number>();

  let okRowCount = serverRanks.length;
  let maxRank = serverRanks.length > 0 ? Math.max(...serverRanks) : 0;
  let minRank: number | null = serverRanks.length > 0 ? Math.min(...serverRanks) : null;
  let lastAssignedRank: number | null =
    okRowCount > 0 ? (inputOrder === "desc" ? minRank : maxRank) : null;

  const sortedDrafts = [...drafts].sort(
    (a, b) => a.seq - b.seq || a.key.localeCompare(b.key)
  );

  for (const draft of sortedDrafts) {
    let rank: number;
    if (draft.tieWithPrevious) {
      if (lastAssignedRank == null) continue;
      rank = lastAssignedRank;
    } else if (inputOrder === "desc") {
      rank =
        okRowCount === 0
          ? calledN
          : Math.max(1, (minRank ?? 1) - 1);
    } else {
      const used = new Set<number>([...serverRanks, ...keyToRank.values()]);
      let r = 1;
      while (r <= calledN && used.has(r)) r++;
      if (r > calledN) break;
      rank = r;
    }

    keyToRank.set(draft.key, rank);
    lastAssignedRank = rank;
    okRowCount += 1;
    maxRank = Math.max(maxRank, rank);
    minRank = minRank == null ? rank : Math.min(minRank, rank);
  }

  return keyToRank;
}
