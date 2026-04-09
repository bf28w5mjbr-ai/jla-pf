import { prisma } from "@/server/db";

const entryHistoryInclude = {
  competition: {
    select: {
      id: true,
      name: true,
      startDate: true,
      status: true,
      requireClubMembership: true,
    },
  },
  club: {
    select: {
      id: true,
      name: true,
    },
  },
  checkoutSessions: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} as const;

export type EntryHistoryRow = Awaited<
  ReturnType<typeof loadEntryHistoryForUser>
>[number];

export async function loadEntryHistoryForUser(userId: string) {
  return prisma.competitionEntry.findMany({
    where: { userId },
    include: entryHistoryInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function loadEntryHistoryForClub(userId: string, clubId: string) {
  return prisma.competitionEntry.findMany({
    where: {
      userId,
      clubId,
    },
    include: entryHistoryInclude,
    orderBy: { createdAt: "desc" },
  });
}
