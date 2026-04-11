import { cache } from "react";
import { prisma } from "@/server/db";

/** 認証レイアウト用: 1 リクエスト内・同一 userId での重複クエリを防ぐ */
export const getAuthenticatedLayoutUser = cache(async (userId: string) => {
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
});
