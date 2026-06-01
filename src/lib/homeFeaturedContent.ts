import { cache } from "react";
import { prisma } from "@/server/db";

const FEATURED_LIMIT = 4;

const featuredInclude = {
  organization: {
    select: {
      name: true,
      abbreviation: true,
    },
  },
} as const;

export type HomeFeaturedCompetition = Awaited<
  ReturnType<typeof loadHomeFeaturedCompetitions>
>[number];

/** トップ用: 開催予定の公開大会（一覧 upcoming と同条件） */
export const loadHomeFeaturedCompetitions = cache(async (limit = FEATURED_LIMIT) => {
  const now = new Date();
  return prisma.competition.findMany({
    where: {
      isPublished: true,
      status: "PUBLISHED",
      startDate: { gte: now },
    },
    include: featuredInclude,
    orderBy: { startDate: "asc" },
    take: limit,
  });
});
