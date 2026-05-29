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

export const loadClubMembersTab = cache(async (clubId: string, currentUserId: string) => {
  const memberships = await prisma.membership.findMany({
    where: { clubId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          profile: { select: { familyName: true, givenName: true } },
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
  });

  const userMembership = memberships.find((m) => m.userId === currentUserId) ?? null;
  const isClubAdmin = Boolean(userMembership && isClubAdminRole(userMembership.role));
  const approvedMembers = memberships.filter((m) => m.status === "APPROVED");
  const pendingMembers = memberships.filter((m) => m.status === "PENDING");

  return {
    userMembership,
    isClubAdmin,
    approvedMembers,
    pendingMembers,
  };
});

/** 代表者セレクタ用（ADMIN のみ・軽量） */
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
