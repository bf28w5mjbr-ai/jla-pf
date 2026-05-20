import { MembershipRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assertOrgOnboardingAllowed,
  assertOrgOperational,
  OrganizerLifecycleError,
} from "@/lib/organizerLifecycle";

export type RequireOrgAdminScope = "onboarding" | "operational";

export { OrganizerLifecycleError };

async function isAssociationAdminUser(userId: string): Promise<boolean> {
  const associationAdmin = await prisma.associationAdmin.findFirst({
    where: {
      userId,
      role: 'ADMIN',
    },
    select: { id: true },
  });
  return !!associationAdmin;
}

export async function requirePfAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user || user.role !== 'PF_ADMIN') {
    throw new Error('PF_ADMIN_REQUIRED');
  }
}

export async function requireAccAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  if (user.role === 'PF_ADMIN' || (await isAssociationAdminUser(userId))) {
    return;
  }
  throw new Error('ACC_ADMIN_REQUIRED');
}

export async function requireAssociationAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  if (user.role === 'PF_ADMIN' || (await isAssociationAdminUser(userId))) {
    return;
  }
  throw new Error('ACC_ADMIN_REQUIRED');
}

export async function requireClubAdmin(clubId: string, userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  if (user.role === 'PF_ADMIN') {
    return;
  }
  if (await isAssociationAdminUser(userId)) {
    throw new Error('ACC_ADMIN_FORBIDDEN');
  }

  const membership = await prisma.membership.findFirst({
    where: {
      clubId,
      userId,
      status: "APPROVED",
      role: MembershipRole.ADMIN,
    },
    select: { id: true },
  });
  if (!membership) {
    throw new Error('CLUB_ADMIN_REQUIRED');
  }
}

export async function requireOrgAdmin(
  organizationId: string,
  userId: string,
  scope: RequireOrgAdminScope = "onboarding"
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  if (user.role === 'PF_ADMIN') {
    if (scope === "operational") {
      await assertOrgOperational(prisma, organizationId);
    }
    return;
  }
  if (await isAssociationAdminUser(userId)) {
    throw new Error('ACC_ADMIN_FORBIDDEN');
  }

  const admin = await prisma.orgAdmin.findFirst({
    where: {
      organizationId,
      userId,
      role: "ADMIN",
    },
    select: { id: true },
  });
  if (!admin) {
    throw new Error('ORG_ADMIN_REQUIRED');
  }

  if (scope === "operational") {
    await assertOrgOperational(prisma, organizationId);
  } else {
    await assertOrgOnboardingAllowed(prisma, organizationId);
  }
}
