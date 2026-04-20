import { cache } from "react";
import { prisma } from "@/server/db";

async function loadAuthenticatedLayoutUserFromDb(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      memberships: {
        where: {
          role: "ADMIN",
          status: "APPROVED",
        },
        select: {
          clubId: true,
          role: true,
          club: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
        },
      },
      associationAdminRoles: {
        where: {
          role: "ADMIN",
        },
        select: {
          id: true,
        },
      },
      orgAdminRoles: {
        where: { role: "ADMIN" },
        select: {
          organization: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
        },
      },
    },
  });
}

/** 認証レイアウト用: 同一リクエスト内の重複呼び出しのみ抑止（リクエスト横断キャッシュはしない） */
export const getAuthenticatedLayoutUser = cache(async (userId: string) => {
  return loadAuthenticatedLayoutUserFromDb(userId);
});

/** サイドバー未読バッジ用（リクエスト内の重複呼び出しのみ抑止） */
export const getCachedUnreadNotificationCount = cache(async (userId: string) => {
  return prisma.notification.count({
    where: { userId, read: false },
  });
});
