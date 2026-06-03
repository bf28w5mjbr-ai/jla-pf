import type { Prisma } from "@prisma/client";
import { officialResultPublicVisibilityWhere } from "@/lib/officialResultPublicVisibility";
import { buildResultRoundLabelMap, displayResultRoundLabel } from "@/lib/resultRoundLabels";
import { prisma } from "@/server/db";

const podiumResultRowSelect = {
  id: true,
  rank: true,
  entryType: true,
  teamEntry: { select: { teamName: true } },
  officialResult: {
    select: {
      round: true,
      competition: {
        select: {
          id: true,
          name: true,
          startDate: true,
          startListSettings: true,
        },
      },
      event: {
        select: { id: true, name: true, startListRoundCount: true },
      },
    },
  },
} satisfies Prisma.OfficialResultRowSelect;

export type UserPodiumResultRow = Prisma.OfficialResultRowGetPayload<{
  select: typeof podiumResultRowSelect;
}>;

export function userPodiumResultRowWhere(userId: string): Prisma.OfficialResultRowWhereInput {
  return {
    rank: { gte: 1, lte: 3 },
    status: "OK",
    advanceWithoutRank: false,
    OR: [
      { competitionEntry: { userId } },
      { teamEntry: { members: { some: { userId } } } },
    ],
    officialResult: {
      round: "FINAL",
      ...officialResultPublicVisibilityWhere(),
    },
  };
}

export function podiumResultRoundLabel(row: UserPodiumResultRow): string {
  const { officialResult } = row;
  const labels = buildResultRoundLabelMap(
    officialResult.competition.startListSettings,
    officialResult.event.id,
    officialResult.event.startListRoundCount
  );
  return displayResultRoundLabel("FINAL", labels);
}

export async function loadUserPodiumResults(
  userId: string,
  take = 6
): Promise<UserPodiumResultRow[]> {
  return prisma.officialResultRow.findMany({
    where: userPodiumResultRowWhere(userId),
    select: podiumResultRowSelect,
    orderBy: [
      { officialResult: { competition: { startDate: "desc" } } },
      { rank: "asc" },
    ],
    take,
  });
}
