import { MembershipRole, MembershipStatus } from "@prisma/client";
import { prisma } from "@/server/db";

export type BroadcastTarget = "ALL" | "ROLE";
export type BroadcastRole = "USER" | "ORG_ADMIN" | "PF_ADMIN" | "CLUB_ADMIN";

export async function resolveBroadcastTargetUserIds(params: {
  target: BroadcastTarget;
  role?: BroadcastRole;
}): Promise<string[]> {
  if (params.target === "ALL") {
    const users = await prisma.user.findMany({ where: {}, select: { id: true } });
    return users.map((u) => u.id);
  }

  if (!params.role) {
    throw new Error("role is required for ROLE target");
  }

  if (params.role === "CLUB_ADMIN") {
    const memberships = await prisma.membership.findMany({
      where: {
        role: MembershipRole.ADMIN,
        status: MembershipStatus.APPROVED,
      },
      select: { userId: true },
    });
    const uniqueIds = [...new Set(memberships.map((m) => m.userId))];
    if (uniqueIds.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  if (params.role === "ORG_ADMIN") {
    const orgAdmins = await prisma.orgAdmin.findMany({
      select: { userId: true },
    });
    const uniqueIds = [...new Set(orgAdmins.map((a) => a.userId))];
    if (uniqueIds.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  const users = await prisma.user.findMany({
    where: { role: params.role },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
