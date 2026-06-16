import { cache } from "react";
import { prisma } from "@/server/db";
import { isClubAdminRole } from "@/lib/roleScopes";

export type ClubMemberRow = {
  id: string;
  userId: string;
  role: string;
  status: string;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    profile: { familyName: string | null; givenName: string | null } | null;
  };
};

const membershipInclude = {
  user: {
    select: {
      id: true,
      email: true,
      profile: { select: { familyName: true, givenName: true } },
    },
  },
} as const;

/** クラブ詳細・メンバータブ共通の membership 一括取得 */
export const loadClubMembershipBundle = cache(async (clubId: string, currentUserId: string) => {
  const memberships = await prisma.membership.findMany({
    where: { clubId },
    include: membershipInclude,
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
  });

  const userMembership = memberships.find((m) => m.userId === currentUserId) ?? null;
  const isClubAdmin = Boolean(userMembership && isClubAdminRole(userMembership.role));
  const approvedMembers = memberships.filter((m) => m.status === "APPROVED") as ClubMemberRow[];
  const pendingMembers = memberships.filter((m) => m.status === "PENDING") as ClubMemberRow[];

  const representativeMemberOptions = isClubAdmin
    ? [...approvedMembers]
        .sort((a, b) => {
          const roleCmp = a.role.localeCompare(b.role);
          if (roleCmp !== 0) return roleCmp;
          return a.createdAt.getTime() - b.createdAt.getTime();
        })
        .map((m) => ({
          userId: m.userId,
          name: `${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim(),
        }))
    : [];

  return {
    userMembership,
    isClubAdmin,
    approvedMembers,
    pendingMembers,
    approvedMemberCount: approvedMembers.length,
    pendingMemberCount: pendingMembers.length,
    representativeMemberOptions,
  };
});

export const loadClubMembersTab = cache(async (clubId: string, currentUserId: string) => {
  const bundle = await loadClubMembershipBundle(clubId, currentUserId);
  return {
    userMembership: bundle.userMembership,
    isClubAdmin: bundle.isClubAdmin,
    approvedMembers: bundle.approvedMembers,
    pendingMembers: bundle.pendingMembers,
  };
});

/** @deprecated loadClubMembershipBundle を使用 */
export async function loadClubRepresentativeMemberOptions(clubId: string) {
  const rows = await prisma.membership.findMany({
    where: { clubId, status: "APPROVED" },
    select: {
      userId: true,
      user: { select: { profile: { select: { familyName: true, givenName: true } } } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((m) => ({
    userId: m.userId,
    name: `${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim(),
  }));
}

/** @deprecated loadClubMembershipBundle を使用 */
export async function countClubMembershipsByStatus(clubId: string) {
  const rows = await prisma.membership.groupBy({
    by: ["status"],
    where: { clubId },
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  return {
    approved: byStatus.APPROVED ?? 0,
    pending: byStatus.PENDING ?? 0,
  };
}
