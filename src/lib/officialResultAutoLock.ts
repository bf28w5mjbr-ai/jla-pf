import type { PrismaClient } from "@prisma/client";
import { getCompetitionEventScheduleInclusiveUtcBounds } from "@/lib/eventScheduleWithinCompetition";

/** 大会公式結果の自動ロック瞬間（最終開催日 23:59:59.999 JST） */
export function competitionOfficialLockInstant(competitionEndDate: Date): Date {
  return getCompetitionEventScheduleInclusiveUtcBounds(
    competitionEndDate,
    competitionEndDate
  ).maxUtc;
}

/** 大会の公式ロック締切を過ぎているか */
export function isPastCompetitionOfficialLockDeadline(
  competitionEndDate: Date,
  now: Date = new Date()
): boolean {
  return now.getTime() > competitionOfficialLockInstant(competitionEndDate).getTime();
}

/** DB の lockedAt または締切超過で編集不可とみなす */
export function isOfficialResultEffectivelyLocked(
  lockedAt: Date | null | undefined,
  competitionEndDate: Date,
  now: Date = new Date()
): boolean {
  if (lockedAt != null) return true;
  return isPastCompetitionOfficialLockDeadline(competitionEndDate, now);
}

/** 当日運用・公式結果 API 用。編集不可なら `OFFICIAL_RESULT_LOCKED` を throw */
export function assertOfficialResultWritable(
  lockedAt: Date | null | undefined,
  competitionEndDate: Date,
  now: Date = new Date()
): void {
  if (isOfficialResultEffectivelyLocked(lockedAt, competitionEndDate, now)) {
    throw new Error("OFFICIAL_RESULT_LOCKED");
  }
}

type CompetitionEndDateDb = {
  competition: {
    findUnique: (args: {
      where: { id: string };
      select: { endDate: true };
    }) => Promise<{ endDate: Date } | null>;
  };
};

export async function assertOfficialResultWritableForCompetition(
  db: CompetitionEndDateDb,
  competitionId: string,
  lockedAt: Date | null | undefined,
  now: Date = new Date()
): Promise<void> {
  const competition = await db.competition.findUnique({
    where: { id: competitionId },
    select: { endDate: true },
  });
  if (!competition) {
    throw new Error("COMPETITION_NOT_FOUND");
  }
  assertOfficialResultWritable(lockedAt, competition.endDate, now);
}

export async function isOfficialResultEffectivelyLockedForCompetition(
  db: CompetitionEndDateDb,
  competitionId: string,
  lockedAt: Date | null | undefined,
  now: Date = new Date()
): Promise<boolean> {
  const competition = await db.competition.findUnique({
    where: { id: competitionId },
    select: { endDate: true },
  });
  if (!competition) return false;
  return isOfficialResultEffectivelyLocked(lockedAt, competition.endDate, now);
}

export type AutoLockOfficialResultsPassResult = {
  competitionsScanned: number;
  officialResultsLocked: number;
};

/**
 * 終了済み大会の、ヒート確定済みかつ未ロックの公式結果に lockedAt を書き込む。
 */
export async function runAutoLockOfficialResultsPass(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<AutoLockOfficialResultsPassResult> {
  const candidates = await prisma.officialResult.findMany({
    where: {
      lockedAt: null,
      heatConfirmations: { some: {} },
    },
    select: {
      id: true,
      competition: { select: { id: true, endDate: true } },
    },
  });

  const lockInstantByCompetitionId = new Map<string, Date>();
  const idsByCompetitionId = new Map<string, string[]>();

  for (const row of candidates) {
    const { id: competitionId, endDate } = row.competition;
    const lockInstant =
      lockInstantByCompetitionId.get(competitionId) ??
      competitionOfficialLockInstant(endDate);
    lockInstantByCompetitionId.set(competitionId, lockInstant);

    if (now.getTime() <= lockInstant.getTime()) continue;

    const bucket = idsByCompetitionId.get(competitionId) ?? [];
    bucket.push(row.id);
    idsByCompetitionId.set(competitionId, bucket);
  }

  let officialResultsLocked = 0;
  for (const [competitionId, officialResultIds] of idsByCompetitionId) {
    const lockInstant = lockInstantByCompetitionId.get(competitionId);
    if (!lockInstant || officialResultIds.length === 0) continue;

    const updated = await prisma.officialResult.updateMany({
      where: {
        id: { in: officialResultIds },
        lockedAt: null,
      },
      data: { lockedAt: lockInstant },
    });
    officialResultsLocked += updated.count;
  }

  return {
    competitionsScanned: lockInstantByCompetitionId.size,
    officialResultsLocked,
  };
}
