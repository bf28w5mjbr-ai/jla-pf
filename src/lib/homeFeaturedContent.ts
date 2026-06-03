import { cache } from "react";
import { clubPublicListWhere, clubPublicSelect, type ClubPublicRecord } from "@/lib/clubPublicFields";
import { prisma } from "@/server/db";

const FEATURED_LIMIT = 4;
const CATEGORY_LIMIT = 8;
const FEATURED_CLUBS_LIMIT = 6;

const featuredInclude = {
  organization: {
    select: {
      name: true,
      abbreviation: true,
      logoUrl: true,
    },
  },
} as const;

export type HomeFeaturedCompetition = Awaited<
  ReturnType<typeof loadHomeFeaturedCompetitions>
>[number];

export type HomeFeaturedClub = ClubPublicRecord;

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

/** トップ用: 公開大会のカテゴリ一覧（browse と同条件） */
export const loadHomeCompetitionCategories = cache(async (limit = CATEGORY_LIMIT) => {
  const groups = await prisma.competition.groupBy({
    by: ["category"],
    where: {
      isPublished: true,
      status: "PUBLISHED",
      category: { not: null },
    },
  });

  return groups
    .map((item) => item.category?.trim() ?? "")
    .filter((value): value is string => value.length > 0)
    .sort((a, b) => a.localeCompare(b, "ja"))
    .slice(0, limit);
});

/** トップ用: 公開クラブ抜粋 */
export const loadHomeFeaturedClubs = cache(async (limit = FEATURED_CLUBS_LIMIT) => {
  return prisma.club.findMany({
    where: clubPublicListWhere,
    select: clubPublicSelect,
    orderBy: { name: "asc" },
    take: limit,
  });
});
