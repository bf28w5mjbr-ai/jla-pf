import { randomBytes } from "crypto";
import type { OrgAdminRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeOrgRoleForWrite, isOrgAdminRole } from "@/lib/roleScopes";
import { assertOrgOnboardingAllowed, OrganizerLifecycleError } from "@/lib/organizerLifecycle";
import { createNotification } from "@/lib/notificationService";

const INVITE_EXPIRY_DAYS = 14;

export class OrgAdminInvitationError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "OrgAdminInvitationError";
  }
}

export function orgAdminInvitationErrorStatus(code: string): number {
  switch (code) {
    case "ORG_NOT_FOUND":
    case "USER_NOT_FOUND":
    case "INVITATION_NOT_FOUND":
      return 404;
    case "ALREADY_MEMBER":
    case "DUPLICATE_PENDING":
    case "LAST_ADMIN":
    case "INVITATION_EXPIRED":
    case "INVITATION_NOT_PENDING":
      return 400;
    case "FORBIDDEN":
    case "WRONG_INVITEE":
      return 403;
    default:
      return 400;
  }
}

function newInviteToken(): string {
  return randomBytes(24).toString("hex");
}

function inviteExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INVITE_EXPIRY_DAYS);
  return d;
}

export async function countOrgAdminsWithRole(
  tx: Prisma.TransactionClient,
  organizationId: string,
  role: OrgAdminRole = "ADMIN"
): Promise<number> {
  return tx.orgAdmin.count({
    where: { organizationId, role },
  });
}

/**
 * 最後の ADMIN を削除・降格できないようガードする。
 */
export async function assertNotLastOrgAdmin(
  tx: Prisma.TransactionClient,
  organizationId: string,
  targetOrgAdminId: string,
  nextRole?: OrgAdminRole
): Promise<void> {
  const target = await tx.orgAdmin.findUnique({
    where: { id: targetOrgAdminId },
    select: { id: true, organizationId: true, role: true },
  });

  if (!target || target.organizationId !== organizationId) {
    throw new OrgAdminInvitationError("MEMBER_NOT_FOUND", "メンバーが見つかりません");
  }

  const removingAdmin =
    isOrgAdminRole(target.role) &&
    (nextRole === undefined || !isOrgAdminRole(nextRole));

  if (!removingAdmin) return;

  const adminCount = await countOrgAdminsWithRole(tx, organizationId, "ADMIN");
  if (adminCount <= 1) {
    throw new OrgAdminInvitationError(
      "LAST_ADMIN",
      "最後の管理者を削除または降格する前に、別の管理者を任命してください"
    );
  }
}

export async function inviteOrgAdmin(
  actorUserId: string,
  organizationId: string,
  invitedUserId: string,
  roleInput?: string
): Promise<{ invitationId: string; token: string }> {
  if (invitedUserId === actorUserId) {
    throw new OrgAdminInvitationError("SELF_INVITE", "自分自身を招待することはできません");
  }

  const role = normalizeOrgRoleForWrite(roleInput ?? "MEMBER");

  const result = await prisma.$transaction(async (tx) => {
    await assertOrgOnboardingAllowed(tx, organizationId);

    const existingAdmin = await tx.orgAdmin.findUnique({
      where: {
        userId_organizationId: { userId: invitedUserId, organizationId },
      },
      select: { id: true },
    });
    if (existingAdmin) {
      throw new OrgAdminInvitationError("ALREADY_MEMBER", "このユーザーはすでにメンバーです");
    }

    const dupPending = await tx.organizationAdminInvitation.findFirst({
      where: {
        organizationId,
        invitedUserId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (dupPending) {
      throw new OrgAdminInvitationError("DUPLICATE_PENDING", "すでに招待中です");
    }

    const invitee = await tx.user.findFirst({
      where: { id: invitedUserId, deletedAt: null },
      select: { id: true },
    });
    if (!invitee) {
      throw new OrgAdminInvitationError("USER_NOT_FOUND", "ユーザーが見つかりません");
    }

    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (!org) {
      throw new OrgAdminInvitationError("ORG_NOT_FOUND", "主催団体が見つかりません");
    }

    const token = newInviteToken();
    const inv = await tx.organizationAdminInvitation.create({
      data: {
        token,
        organizationId,
        invitedByUserId: actorUserId,
        invitedUserId,
        role,
        status: "PENDING",
        expiresAt: inviteExpiresAt(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "ORG_ADMIN_INVITE",
        target: inv.id,
        meta: { organizationId, invitedUserId, role },
      },
    });

    return { invitation: inv, orgName: org.name };
  });

  void createNotification({
    userId: invitedUserId,
    category: "GENERAL",
    type: "ORG_ADMIN_INVITATION",
    title: "主催団体への招待",
    body: `${result.orgName} の管理メンバーとして招待されています。`,
    relatedId: result.invitation.id,
    linkUrl: `/invite/org-admin/${result.invitation.token}`,
  }).catch((err) => console.error("Org admin invite notification error:", err));

  return { invitationId: result.invitation.id, token: result.invitation.token };
}

export async function acceptOrgAdminInvitation(
  token: string,
  userId: string
): Promise<{ organizationId: string }> {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.organizationAdminInvitation.findUnique({
      where: { token },
      include: { organization: { select: { id: true, name: true, status: true } } },
    });

    if (!inv) {
      throw new OrgAdminInvitationError("INVITATION_NOT_FOUND", "招待が見つかりません");
    }
    if (inv.status !== "PENDING") {
      throw new OrgAdminInvitationError("INVITATION_NOT_PENDING", "この招待はすでに処理されています");
    }
    if (inv.expiresAt < new Date()) {
      await tx.organizationAdminInvitation.update({
        where: { id: inv.id },
        data: { status: "EXPIRED" },
      });
      throw new OrgAdminInvitationError("INVITATION_EXPIRED", "招待の有効期限が切れています");
    }
    if (inv.invitedUserId !== userId) {
      throw new OrgAdminInvitationError("WRONG_INVITEE", "この招待の宛先ではありません");
    }

    rejectIfSuspendedForInvite(inv.organization.status);

    const existingAdmin = await tx.orgAdmin.findUnique({
      where: {
        userId_organizationId: { userId, organizationId: inv.organizationId },
      },
      select: { id: true },
    });
    if (existingAdmin) {
      await tx.organizationAdminInvitation.update({
        where: { id: inv.id },
        data: { status: "ACCEPTED" },
      });
      return { organizationId: inv.organizationId };
    }

    await tx.orgAdmin.create({
      data: {
        userId,
        organizationId: inv.organizationId,
        role: inv.role,
      },
    });

    await tx.organizationAdminInvitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED" },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        action: "ORG_ADMIN_INVITE_ACCEPT",
        target: inv.id,
        meta: { organizationId: inv.organizationId },
      },
    });

    return { organizationId: inv.organizationId };
  });
}

function rejectIfSuspendedForInvite(status: string): void {
  if (status === "SUSPENDED" || status === "INACTIVE") {
    throw new OrganizerLifecycleError("ORG_SUSPENDED", "この主催団体は現在停止中です");
  }
}

export async function declineOrgAdminInvitation(
  token: string,
  userId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const inv = await tx.organizationAdminInvitation.findUnique({
      where: { token },
    });

    if (!inv) {
      throw new OrgAdminInvitationError("INVITATION_NOT_FOUND", "招待が見つかりません");
    }
    if (inv.invitedUserId !== userId) {
      throw new OrgAdminInvitationError("WRONG_INVITEE", "この招待の宛先ではありません");
    }
    if (inv.status !== "PENDING") {
      throw new OrgAdminInvitationError("INVITATION_NOT_PENDING", "この招待はすでに処理されています");
    }

    await tx.organizationAdminInvitation.update({
      where: { id: inv.id },
      data: { status: "DECLINED" },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        action: "ORG_ADMIN_INVITE_DECLINE",
        target: inv.id,
      },
    });
  });
}

export async function cancelOrgAdminInvitation(
  actorUserId: string,
  organizationId: string,
  invitationId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await assertOrgOnboardingAllowed(tx, organizationId);

    const inv = await tx.organizationAdminInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!inv || inv.organizationId !== organizationId) {
      throw new OrgAdminInvitationError("INVITATION_NOT_FOUND", "招待が見つかりません");
    }
    if (inv.status !== "PENDING") {
      throw new OrgAdminInvitationError("INVITATION_NOT_PENDING", "取消できるのは保留中の招待のみです");
    }

    await tx.organizationAdminInvitation.update({
      where: { id: inv.id },
      data: { status: "CANCELLED" },
    });

    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "ORG_ADMIN_INVITE_CANCEL",
        target: inv.id,
      },
    });
  });
}
