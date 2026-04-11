import type { PrismaClient, ResultRound } from "@prisma/client";

type OfficialResultScopedDb = Pick<PrismaClient, "officialResult">;

/**
 * 当該ラウンドの公式結果で、指定ヒートに順位行またはヒート確定があるヒート番号の集合。
 * マーシャル締切の「解除」は、このいずれかが存在するヒートでは不可とする。
 */
export async function heatIndicesBlockingMarshalReopen(
  db: OfficialResultScopedDb,
  params: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    heatIndices: number[];
  }
): Promise<Set<number>> {
  const { competitionId, eventId, round, heatIndices } = params;
  const uniq = [...new Set(heatIndices.filter((n) => Number.isInteger(n) && n >= 1))];
  if (uniq.length === 0) return new Set();

  const official = await db.officialResult.findUnique({
    where: {
      competitionId_eventId_round: { competitionId, eventId, round },
    },
    select: {
      rows: {
        where: { heat: { in: uniq } },
        select: { heat: true },
      },
      heatConfirmations: {
        where: { heat: { in: uniq } },
        select: { heat: true },
      },
    },
  });

  if (!official) return new Set();
  const blocked = new Set<number>();
  for (const r of official.rows) {
    if (typeof r.heat === "number" && Number.isInteger(r.heat)) {
      blocked.add(r.heat);
    }
  }
  for (const c of official.heatConfirmations) {
    if (Number.isInteger(c.heat)) {
      blocked.add(c.heat);
    }
  }
  return blocked;
}

export async function marshalReopenBlockedForHeat(
  db: OfficialResultScopedDb,
  params: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    heatIndex: number;
  }
): Promise<boolean> {
  const s = await heatIndicesBlockingMarshalReopen(db, {
    ...params,
    heatIndices: [params.heatIndex],
  });
  return s.has(params.heatIndex);
}
