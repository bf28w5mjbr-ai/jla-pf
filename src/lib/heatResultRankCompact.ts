import type { Prisma } from "@prisma/client";

export type OkRankRowForCompact = {
  id: string;
  rank: number;
  tieGroup: string | null;
};

/** 同着レベルを維持したまま、OK 着順の欠番を 1..n に詰める（純関数・テスト用） */
export function computeCompactOkRanks(
  rows: ReadonlyArray<OkRankRowForCompact>
): Map<string, number> {
  if (rows.length === 0) return new Map();

  const sorted = [...rows].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

  type Level = { key: string; minRank: number; rowIds: string[] };
  const levelByKey = new Map<string, Level>();

  for (const row of sorted) {
    const key = row.tieGroup ? `tg:${row.tieGroup}` : `r:${row.rank}`;
    const existing = levelByKey.get(key);
    if (existing) {
      existing.rowIds.push(row.id);
      existing.minRank = Math.min(existing.minRank, row.rank);
    } else {
      levelByKey.set(key, { key, minRank: row.rank, rowIds: [row.id] });
    }
  }

  const levels = [...levelByKey.values()].sort(
    (a, b) => a.minRank - b.minRank || a.key.localeCompare(b.key)
  );

  const result = new Map<string, number>();
  let nextRank = 1;
  for (const level of levels) {
    for (const id of level.rowIds) {
      result.set(id, nextRank);
    }
    nextRank += 1;
  }
  return result;
}

export type CompactOkRanksResult = {
  updatedCount: number;
};

/**
 * ヒート内の OK 着順行を同着維持で詰める。変更がない行は update しない。
 * 呼び出し側でヒート確定済み・公式ロックを確認すること。
 */
export async function compactOkRanksForHeatInTransaction(
  tx: Prisma.TransactionClient,
  opts: {
    officialResultId: string;
    heatIndex: number;
  }
): Promise<CompactOkRanksResult> {
  const rows = await tx.officialResultRow.findMany({
    where: {
      officialResultId: opts.officialResultId,
      heat: opts.heatIndex,
      status: "OK",
      rank: { not: null },
      advanceWithoutRank: false,
    },
    select: { id: true, rank: true, tieGroup: true },
    orderBy: [{ rank: "asc" }, { id: "asc" }],
  });

  const inputs: OkRankRowForCompact[] = rows
    .filter((r): r is typeof r & { rank: number } => r.rank != null)
    .map((r) => ({ id: r.id, rank: r.rank, tieGroup: r.tieGroup }));

  const newRanks = computeCompactOkRanks(inputs);
  let updatedCount = 0;

  for (const row of inputs) {
    const nextRank = newRanks.get(row.id);
    if (nextRank == null || nextRank === row.rank) continue;
    await tx.officialResultRow.update({
      where: { id: row.id },
      data: { rank: nextRank },
    });
    updatedCount += 1;
  }

  return { updatedCount };
}
