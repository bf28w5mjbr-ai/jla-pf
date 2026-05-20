import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { assertClubOperational, ClubOperationalError } from "@/lib/clubLifecycle";
import { isClubAdminRole } from "@/lib/roleScopes";
import { createNotification } from "@/lib/notificationService";
import { appRoutes } from "@/lib/appRoutes";

const MEMBERSHIP_APPLICATIONS_PER_HOUR_LIMIT = 3;
const MEMBERSHIP_REAPPLY_COOLDOWN_DAYS = 7;

const includeUserClub = {
  user: {
    select: {
      id: true,
      email: true,
      profile: { select: { familyName: true, givenName: true } },
    },
  },
  club: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

async function notifyClubAdminsOfMembershipApplication(
  clubId: string,
  clubName: string,
  applicantName: string,
  membershipId: string
): Promise<void> {
  const admins = await prisma.membership.findMany({
    where: {
      clubId,
      status: "APPROVED",
      role: "ADMIN",
    },
    select: { userId: true },
  });

  const linkUrl = appRoutes.clubs.tab(clubId, "members");
  const body = `${applicantName}さんから参加申請がありました。`;

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.userId,
        category: "CLUB",
        type: "MEMBERSHIP_APPLY",
        title: `${clubName}への参加申請`,
        body,
        relatedId: membershipId,
        linkUrl,
      }).catch((err) => {
        console.error("Membership apply notification error:", err);
      })
    )
  );
}

function mapClubError(error: unknown): MembershipApplicationError | null {
  if (error instanceof ClubOperationalError) {
    return new MembershipApplicationError(error.code, error.message);
  }
  return null;
}

/**
 * メンバーシップ申請の唯一の正
 * 重複チェック、トランザクション、監査ログをすべてここで管理
 *
 * 用途:
 * - POST /api/clubs/[clubId]/join
 * - POST /api/memberships（内部委譲）
 *
 * 参加は PENDING。管理者承認後に APPROVED。
 */
export async function applyForMembership(userId: string, clubId: string) {
  try {
    const membership = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertClubOperational(tx, clubId);

      const existing = await tx.membership.findUnique({
        where: {
          userId_clubId: { userId, clubId },
        },
        select: {
          id: true,
          status: true,
          updatedAt: true,
        },
      });

      if (existing) {
        if (existing.status === "APPROVED") {
          throw new MembershipApplicationError(
            "ALREADY_MEMBER",
            "既にこのクラブに所属しています"
          );
        }
        if (existing.status === "PENDING") {
          throw new MembershipApplicationError(
            "PENDING_APPLICATION",
            "既に参加申請中です"
          );
        }
        if (existing.status === "REJECTED") {
          const cooldownMs = MEMBERSHIP_REAPPLY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
          if (Date.now() - existing.updatedAt.getTime() < cooldownMs) {
            throw new MembershipApplicationError(
              "REJECTED_COOLDOWN",
              `このクラブへの再申請は${MEMBERSHIP_REAPPLY_COOLDOWN_DAYS}日後に可能です`
            );
          }
        }
      }

      const isReapplyFromRejected = existing?.status === "REJECTED";

      if (!existing || isReapplyFromRejected) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentApplications = await tx.membership.count({
          where: {
            userId,
            createdAt: { gte: oneHourAgo },
          },
        });

        if (recentApplications >= MEMBERSHIP_APPLICATIONS_PER_HOUR_LIMIT) {
          throw new MembershipApplicationError(
            "RATE_LIMIT_EXCEEDED",
            "参加申請の回数が上限に達しました。しばらく時間をおいてから再度お試しください"
          );
        }
      }

      const newMembership = isReapplyFromRejected
        ? await tx.membership.update({
            where: { id: existing!.id },
            data: { status: "PENDING", role: "MEMBER" },
            include: includeUserClub,
          })
        : await tx.membership.create({
            data: {
              userId,
              clubId,
              role: "MEMBER",
              status: "PENDING",
            },
            include: includeUserClub,
          });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: "MEMBERSHIP_APPLY",
          target: newMembership.id,
        },
      });

      return newMembership;
    });

    const applicantName =
      `${membership.user.profile?.familyName ?? ""} ${membership.user.profile?.givenName ?? ""}`.trim() ||
      membership.user.email;

    void notifyClubAdminsOfMembershipApplication(
      clubId,
      membership.club.name,
      applicantName,
      membership.id
    );

    return {
      success: true,
      membership,
      message: `${membership.club.name}への参加申請を送りました。管理者の承認をお待ちください。`,
    };
  } catch (error) {
    const mapped = mapClubError(error);
    if (mapped) {
      return { success: false, error: mapped.code, message: mapped.message };
    }
    if (error instanceof MembershipApplicationError) {
      return { success: false, error: error.code, message: error.message };
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        error: "DUPLICATE_APPLICATION",
        message: "既に申請済みか所属しています",
      };
    }

    console.error("Membership application error:", error);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "申請に失敗しました",
    };
  }
}

type MembershipMutationOptions = {
  pfBypass?: boolean;
};

async function assertCanMutateMembership(
  tx: Prisma.TransactionClient,
  clubId: string,
  actorUserId: string,
  options?: MembershipMutationOptions
): Promise<void> {
  if (options?.pfBypass) return;

  const actor = await tx.membership.findFirst({
    where: {
      userId: actorUserId,
      clubId,
      status: "APPROVED",
    },
    select: { role: true },
  });

  if (!actor || !isClubAdminRole(actor.role)) {
    throw new MembershipApplicationError(
      "UNAUTHORIZED",
      "クラブ管理者のみが操作できます"
    );
  }
}

/**
 * メンバーシップを承認（PENDING → APPROVED）
 */
export async function approveMembership(
  membershipId: string,
  approverUserId: string,
  clubId: string,
  options?: MembershipMutationOptions
) {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertClubOperational(tx, clubId);
      await assertCanMutateMembership(tx, clubId, approverUserId, options);

      const membership = await tx.membership.findUnique({
        where: { id: membershipId },
        include: includeUserClub,
      });

      if (!membership) {
        throw new MembershipApplicationError(
          "MEMBERSHIP_NOT_FOUND",
          "メンバーシップが見つかりません"
        );
      }

      if (membership.clubId !== clubId) {
        throw new MembershipApplicationError("CLUB_MISMATCH", "権限がありません");
      }

      if (membership.status !== "PENDING") {
        throw new MembershipApplicationError(
          "INVALID_STATUS",
          `${membership.status}のメンバーシップは承認できません`
        );
      }

      const updated = await tx.membership.update({
        where: { id: membershipId },
        data: { status: "APPROVED" },
        include: includeUserClub,
      });

      await tx.auditLog.create({
        data: {
          actorUserId: approverUserId,
          action: "MEMBERSHIP_APPROVE",
          target: membershipId,
          meta: options?.pfBypass ? { pfAdminBypass: true } : undefined,
        },
      });

      return updated;
    });

    void createNotification({
      userId: result.user.id,
      category: "CLUB",
      type: "MEMBERSHIP_APPROVED",
      title: "クラブ参加が承認されました",
      body: `${result.club.name}への参加が承認されました。`,
      relatedId: membershipId,
      linkUrl: appRoutes.clubs.root(clubId),
    }).catch((err) => console.error("Membership approved notification error:", err));

    return {
      success: true,
      membership: result,
      message: "メンバーを承認しました",
    };
  } catch (error) {
    const mapped = mapClubError(error);
    if (mapped) {
      return { success: false, error: mapped.code, message: mapped.message };
    }
    if (error instanceof MembershipApplicationError) {
      return { success: false, error: error.code, message: error.message };
    }

    console.error("Membership approval error:", error);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "承認に失敗しました",
    };
  }
}

/**
 * メンバーシップを拒否（PENDING → REJECTED）
 */
export async function rejectMembership(
  membershipId: string,
  rejecterUserId: string,
  clubId: string,
  reason?: string,
  options?: MembershipMutationOptions
) {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertClubOperational(tx, clubId);
      await assertCanMutateMembership(tx, clubId, rejecterUserId, options);

      const membership = await tx.membership.findUnique({
        where: { id: membershipId },
        select: { id: true, clubId: true, status: true, userId: true },
      });

      if (!membership) {
        throw new MembershipApplicationError(
          "MEMBERSHIP_NOT_FOUND",
          "メンバーシップが見つかりません"
        );
      }

      if (membership.clubId !== clubId) {
        throw new MembershipApplicationError("CLUB_MISMATCH", "権限がありません");
      }

      if (membership.status !== "PENDING") {
        throw new MembershipApplicationError(
          "INVALID_STATUS",
          `${membership.status}のメンバーシップは拒否できません`
        );
      }

      const updated = await tx.membership.update({
        where: { id: membershipId },
        data: { status: "REJECTED" },
        include: includeUserClub,
      });

      await tx.auditLog.create({
        data: {
          actorUserId: rejecterUserId,
          action: "MEMBERSHIP_REJECT",
          target: membershipId,
          meta: { clubId, reason, ...(options?.pfBypass ? { pfAdminBypass: true } : {}) },
        },
      });

      return updated;
    });

    void createNotification({
      userId: result.user.id,
      category: "CLUB",
      type: "MEMBERSHIP_REJECTED",
      title: "クラブ参加申請が却下されました",
      body: reason
        ? `${result.club.name}への参加申請が却下されました。理由: ${reason}`
        : `${result.club.name}への参加申請が却下されました。`,
      relatedId: membershipId,
    }).catch((err) => console.error("Membership rejected notification error:", err));

    return {
      success: true,
      membership: result,
      message: "参加申請を却下しました",
    };
  } catch (error) {
    const mapped = mapClubError(error);
    if (mapped) {
      return { success: false, error: mapped.code, message: mapped.message };
    }
    if (error instanceof MembershipApplicationError) {
      return { success: false, error: error.code, message: error.message };
    }

    console.error("Membership rejection error:", error);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "拒否に失敗しました",
    };
  }
}

/**
 * メンバーシップを削除（クラブ管理者のみ。本人による自主退会は不可）
 */
export async function deleteMembership(
  membershipId: string,
  requestingUserId: string,
  clubId: string
) {
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const membership = await tx.membership.findUnique({
        where: { id: membershipId },
        include: {
          user: { select: { id: true } },
          club: { select: { id: true } },
        },
      });

      if (!membership) {
        throw new MembershipApplicationError(
          "MEMBERSHIP_NOT_FOUND",
          "メンバーシップが見つかりません"
        );
      }

      if (membership.clubId !== clubId) {
        throw new MembershipApplicationError("CLUB_MISMATCH", "権限がありません");
      }

      await assertCanMutateMembership(tx, clubId, requestingUserId);

      await tx.membership.delete({
        where: { id: membershipId },
      });

      const remainingMembers = await tx.membership.count({
        where: { clubId, status: "APPROVED" },
      });

      if (remainingMembers === 0) {
        await tx.club.update({
          where: { id: clubId },
          data: { status: "SUSPENDED", suspendedReason: "NO_ADMIN" },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: requestingUserId,
          action: "MEMBERSHIP_REMOVE",
          target: membershipId,
          meta: { targetUserId: membership.userId, clubId },
        },
      });
    });

    return {
      success: true,
      message: "メンバーシップを削除しました",
    };
  } catch (error) {
    if (error instanceof MembershipApplicationError) {
      return { success: false, error: error.code, message: error.message };
    }

    console.error("Membership deletion error:", error);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "削除に失敗しました",
    };
  }
}

export class MembershipApplicationError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "MembershipApplicationError";
  }
}

export function membershipServiceErrorStatus(code: string | undefined): number {
  switch (code) {
    case "CLUB_NOT_FOUND":
    case "MEMBERSHIP_NOT_FOUND":
      return 404;
    case "UNAUTHORIZED":
    case "CLUB_MISMATCH":
      return 403;
    case "ALREADY_MEMBER":
    case "PENDING_APPLICATION":
    case "DUPLICATE_APPLICATION":
    case "INVALID_STATUS":
    case "INVALID_TRANSITION":
    case "CLUB_NOT_ACCEPTING":
      return 400;
    case "RATE_LIMIT_EXCEEDED":
    case "REJECTED_COOLDOWN":
      return 429;
    default:
      return 500;
  }
}
