import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/server/db";

type AuthenticatedLayoutUser = Awaited<
  ReturnType<typeof loadAuthenticatedLayoutUserFromDb>
>;

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

const getAuthenticatedLayoutUserCrossRequestCache = unstable_cache(
  async (userId: string): Promise<AuthenticatedLayoutUser> => {
    return loadAuthenticatedLayoutUserFromDb(userId);
  },
  ["authenticated-layout-user"],
  {
    revalidate: 30,
  }
);

/** 認証レイアウト用: リクエスト内重複防止 + 短時間の横断キャッシュ */
export const getAuthenticatedLayoutUser = cache(async (userId: string) => {
  return getAuthenticatedLayoutUserCrossRequestCache(userId);
});

const getUnreadNotificationCountCrossRequestCache = unstable_cache(
  async (userId: string) =>
    prisma.notification.count({
      where: { userId, read: false },
    }),
  ["sidebar-unread-notification-count"],
  { revalidate: 15 }
);

/** サイドバー未読バッジ用（最大約15秒の表示遅れで DB 負荷を下げる） */
export const getCachedUnreadNotificationCount = cache(async (userId: string) => {
  return getUnreadNotificationCountCrossRequestCache(userId);
});
