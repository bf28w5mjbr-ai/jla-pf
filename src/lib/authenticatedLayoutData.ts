import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/server/db";
import { notificationUnreadCountTag } from "@/lib/cacheTags";

const authenticatedAppUserSelect = {
  id: true,
  role: true,
  email: true,
  profile: {
    select: {
      familyName: true,
      givenName: true,
      familyNameKana: true,
      givenNameKana: true,
      dateOfBirth: true,
      profilePhotoUrl: true,
    },
  },
  contact: { select: { phoneNumber: true } },
  jlaProfile: { select: { jlaMemberNumber: true } },
  nfcTag: { select: { nfcTagId: true } },
  _count: { select: { passkeyCredentials: true } },
  memberships: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      clubId: true,
      role: true,
      status: true,
      createdAt: true,
      club: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
      },
    },
  },
  qualifications: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      kind: true,
      status: true,
      expiryDate: true,
      createdAt: true,
      recordOrigin: true,
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
} as const;

type AuthenticatedAppUserRow = Prisma.UserGetPayload<{
  select: typeof authenticatedAppUserSelect;
}>;

export type AuthenticatedAppUser = Omit<
  AuthenticatedAppUserRow,
  "profile" | "contact" | "jlaProfile" | "nfcTag"
> & {
  familyName: string;
  givenName: string;
  familyNameKana: string;
  givenNameKana: string;
  phoneNumber: string;
  dateOfBirth: Date;
  jlaMemberNumber: string | null;
  nfcTagId: string | null;
  profilePhotoUrl: string | null;
};

/**
 * ダッシュボードと認証レイアウトで共有するユーザー行（同一リクエスト内は1回の DB 往復）。
 */
export const getAuthenticatedAppUser = cache(async (userId: string) => {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: authenticatedAppUserSelect,
  });
  if (!u) return null;
  return {
    ...u,
    familyName: u.profile?.familyName ?? "",
    givenName: u.profile?.givenName ?? "",
    familyNameKana: u.profile?.familyNameKana ?? "",
    givenNameKana: u.profile?.givenNameKana ?? "",
    phoneNumber: u.contact?.phoneNumber ?? "",
    dateOfBirth: u.profile?.dateOfBirth ?? new Date(0),
    jlaMemberNumber: u.jlaProfile?.jlaMemberNumber ?? null,
    nfcTagId: u.nfcTag?.nfcTagId ?? null,
    profilePhotoUrl: u.profile?.profilePhotoUrl ?? null,
  } satisfies AuthenticatedAppUser;
});

/**
 * 認証レイアウト用の形へ射影（シェルは ADMIN+APPROVED のクラブ管理のみ参照）。
 */
export const getAuthenticatedLayoutUser = cache(async (userId: string) => {
  const u = await getAuthenticatedAppUser(userId);
  if (!u) return null;
  const memberships = u.memberships.filter(
    (m) => m.role === "ADMIN" && m.status === "APPROVED"
  );
  return {
    role: u.role,
    memberships: memberships.map((m) => ({
      clubId: m.clubId,
      role: m.role,
      club: m.club,
    })),
    associationAdminRoles: u.associationAdminRoles,
    orgAdminRoles: u.orgAdminRoles,
  };
});

export async function getCachedUnreadNotificationCount(userId: string): Promise<number> {
  return unstable_cache(
    async () =>
      prisma.notification.count({
        where: { userId, read: false },
      }),
    ["notification-unread-count", userId],
    { revalidate: 30, tags: [notificationUnreadCountTag(userId)] }
  )();
}
