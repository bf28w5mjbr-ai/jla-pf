import { cache } from "react";
import { unstable_cache } from "next/cache";
import { clubPublicListWhere, clubPublicSelect } from "@/lib/clubPublicFields";
import { prisma } from "@/server/db";

const REVALIDATE_SECONDS = 60;

export const loadPublicClubList = cache(async (searchQuery: string) => {
  const q = searchQuery.trim();
  const where = {
    ...clubPublicListWhere,
    ...(q.length > 0
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { nameKana: { contains: q, mode: "insensitive" as const } },
            { abbreviation: { contains: q, mode: "insensitive" as const } },
            { patrolLocation: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  return prisma.club.findMany({
    where,
    select: clubPublicSelect,
    orderBy: { name: "asc" },
    take: 200,
  });
});

export const loadPublicClubDetail = cache(async (clubId: string) => {
  return unstable_cache(
    async () =>
      prisma.club.findFirst({
        where: { id: clubId, ...clubPublicListWhere },
        select: clubPublicSelect,
      }),
    ["public-club-detail", clubId],
    { revalidate: REVALIDATE_SECONDS }
  )();
});
