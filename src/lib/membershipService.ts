import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const MEMBERSHIP_APPLICATIONS_PER_HOUR_LIMIT = 3;
const MEMBERSHIP_REAPPLY_COOLDOWN_DAYS = 7;

async function ensureClubEstablished(
  tx: Prisma.TransactionClient,
  clubId: string
): Promise<{ id: string; name: string }> {
  const club = await tx.club.findUnique({
    where: { id: clubId },
    select: { id: true, status: true, name: true },
  });

  if (!club) {
    throw new MembershipApplicationError(
      "CLUB_NOT_FOUND",
      "クラブが見つかりません"
    );
  }

  if (club.status !== "APPROVED") {
    throw new MembershipApplicationError(
      "CLUB_NOT_ACCEPTING",
      "このクラブは現在参加申請を受け付けていません"
    );
  }

  const fiscalYear = new Date().getFullYear();
  const registration = await tx.clubAnnualRegistration.findUnique({
    where: {
      clubId_fiscalYear: {
        clubId,
        fiscalYear,
      },
    },
    select: { status: true },
  });

  if (!registration || registration.status !== "PAID") {
    throw new MembershipApplicationError(
      "CLUB_NOT_ESTABLISHED",
      "このクラブは年度登録が完了していないため参加申請を受け付けていません"
    );
  }

  return { id: club.id, name: club.name };
}

/**
 * メンバーシップ申請の唯一の正
 * 重複チェック、トランザクション、監査ログをすべてここで管理
 * 
 * 用途: 以下の3つのAPIエンドポイントから呼び出される
 * - POST /api/memberships
 * - POST /api/clubs/[id]/join  
 * - POST /api/clubs/apply
 * 
 * (将来的に統廃合対象)
 */
export async function applyForMembership(
  userId: string,
  clubId: string
) {
  try {
    // Transaction で競合を防ぐ
    const membership = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. クラブの存在確認 + 申請受付状態の確認
      await ensureClubEstablished(tx, clubId);

      // 2. 既存の申請/所属をチェック（重複防止）
      const existing = await tx.membership.findUnique({
        where: {
          userId_clubId: {
            userId,
            clubId,
          },
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
        } else if (existing.status === "PENDING") {
          throw new MembershipApplicationError(
            "ALREADY_PENDING",
            "既に参加申請を送信済みです"
          );
        } else if (existing.status === "REJECTED") {
          const cooldownMs = MEMBERSHIP_REAPPLY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
          const now = Date.now();
          if (existing.updatedAt && now - existing.updatedAt.getTime() < cooldownMs) {
            throw new MembershipApplicationError(
              "REJECTED_COOLDOWN",
              `このクラブへの再申請は${MEMBERSHIP_REAPPLY_COOLDOWN_DAYS}日後に可能です`
            );
          }
        }
      }

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
          "申請回数が上限に達しました。しばらく時間をおいてから再度お試しください"
        );
      }

      const newMembership = existing?.status === "REJECTED"
        ? await tx.membership.update({
            where: { id: existing.id },
            data: { status: "PENDING" },
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  familyName: true,
                  givenName: true,
                },
              },
              club: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          })
        : await tx.membership.create({
            data: {
              userId,
              clubId,
              role: "MEMBER",
              status: "PENDING",
            },
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  familyName: true,
                  givenName: true,
                },
              },
              club: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });

      // 4. 監査ログ記録
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: "MEMBERSHIP_APPLY",
          target: newMembership.id,
        },
      });

      return newMembership;
    });

    return {
      success: true,
      membership,
      message: `${membership.club.name}への参加申請を送信しました。承認をお待ちください。`,
    };
  } catch (error) {
    if (error instanceof MembershipApplicationError) {
      return {
        success: false,
        error: error.code,
        message: error.message,
      };
    }

    // Prisma unique constraint violation
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

/**
 * メンバーシップを承認（PENDING → APPROVED）
 */
export async function approveMembership(
  membershipId: string,
  approverUserId: string,
  clubId: string
) {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await ensureClubEstablished(tx, clubId);
      // 1. 承認者の権限確認
      const approver = await tx.membership.findFirst({
        where: {
          userId: approverUserId,
          clubId,
          status: "APPROVED",
        },
        select: { id: true },
      });

      if (!approver) {
        throw new MembershipApplicationError(
          "UNAUTHORIZED",
          "クラブの承認済みメンバーのみが承認できます"
        );
      }

      // 2. 対象メンバーシップを取得
      const membership = await tx.membership.findUnique({
        where: { id: membershipId },
        include: {
          user: { select: { id: true, email: true, familyName: true, givenName: true } },
          club: { select: { id: true, name: true } },
        },
      });

      if (!membership) {
        throw new MembershipApplicationError(
          "MEMBERSHIP_NOT_FOUND",
          "メンバーシップが見つかりません"
        );
      }

      if (membership.clubId !== clubId) {
        throw new MembershipApplicationError(
          "CLUB_MISMATCH",
          "権限がありません"
        );
      }

      // 3. PENDING の場合のみ承認可能
      if (membership.status !== "PENDING") {
        throw new MembershipApplicationError(
          "INVALID_STATUS",
          `${membership.status}のメンバーシップは承認できません`
        );
      }

      // 4. 承認
      const updated = await tx.membership.update({
        where: { id: membershipId },
        data: {
          status: "APPROVED",
        },
        include: {
          user: { select: { id: true } },
          club: { select: { id: true, name: true } },
        },
      });

      // 5. 監査ログ記録
      await tx.auditLog.create({
        data: {
          actorUserId: approverUserId,
          action: "MEMBERSHIP_APPROVE",
          target: membershipId,
        },
      });

      return updated;
    });

    return {
      success: true,
      membership: result,
      message: "メンバーを承認しました",
    };
  } catch (error) {
    if (error instanceof MembershipApplicationError) {
      return {
        success: false,
        error: error.code,
        message: error.message,
      };
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
  reason?: string
) {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await ensureClubEstablished(tx, clubId);
      // 1. 拒否権者の権限確認
      const rejecter = await tx.membership.findFirst({
        where: {
          userId: rejecterUserId,
          clubId,
          status: "APPROVED",
        },
        select: { id: true },
      });

      if (!rejecter) {
        throw new MembershipApplicationError(
          "UNAUTHORIZED",
          "クラブの承認済みメンバーのみが拒否できます"
        );
      }

      // 2. 対象メンバーシップを取得
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
        throw new MembershipApplicationError(
          "CLUB_MISMATCH",
          "権限がありません"
        );
      }

      // 3. PENDING の場合のみ拒否可能
      if (membership.status !== "PENDING") {
        throw new MembershipApplicationError(
          "INVALID_STATUS",
          `${membership.status}のメンバーシップは拒否できません`
        );
      }

      // 4. 拒否
      const updated = await tx.membership.update({
        where: { id: membershipId },
        data: {
          status: "REJECTED",
        },
        include: {
          user: { select: { id: true } },
          club: { select: { id: true, name: true } },
        },
      });

      // 5. 監査ログ記録
      await tx.auditLog.create({
        data: {
          actorUserId: rejecterUserId,
          action: "MEMBERSHIP_REJECT",
          target: "MEMBERSHIP",
          meta: JSON.stringify({
            status: "PENDING→REJECTED",
            clubId,
            reason,
          }),
        },
      });

      return updated;
    });

    return {
      success: true,
      membership: result,
      message: "メンバーシップを拒否しました",
    };
  } catch (error) {
    if (error instanceof MembershipApplicationError) {
      return {
        success: false,
        error: error.code,
        message: error.message,
      };
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
 * メンバーシップを削除（APPROVED のメンバーが脱退、または管理者が強制削除）
 */
export async function deleteMembership(
  membershipId: string,
  requestingUserId: string,
  clubId: string
) {
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. 対象メンバーシップを取得
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
        throw new MembershipApplicationError(
          "CLUB_MISMATCH",
          "権限がありません"
        );
      }

      // 2. 削除権限チェック
      // ケース1: 自分のメンバーシップの脱退（本人申告）
      // ケース2: 管理者が他人を強制削除（ADMIN権限）
      let isAuthorized = false;

      if (requestingUserId === membership.userId) {
        // 本人は常に脱退可能
        isAuthorized = true;
      } else {
        // 管理者の権限確認
        const requester = await tx.membership.findFirst({
          where: {
            userId: requestingUserId,
            clubId,
            status: "APPROVED",
          },
          select: { id: true },
        });
        isAuthorized = !!requester;
      }

      if (!isAuthorized) {
        throw new MembershipApplicationError(
          "UNAUTHORIZED",
          "このメンバーシップを削除する権限がありません"
        );
      }

      // 3. 削除実行
      const deleted = await tx.membership.delete({
        where: { id: membershipId },
      });

      // 4. 残りの管理者がいない場合はクラブを停止
      const remainingAdmins = await tx.membership.count({
        where: {
          clubId,
          status: "APPROVED",
        },
      });

      if (remainingAdmins === 0) {
        await tx.club.update({
          where: { id: clubId },
          data: { status: "SUSPENDED" },
        });
      }

      // 5. 監査ログ記録
      await tx.auditLog.create({
        data: {
          actorUserId: requestingUserId,
          action:
            requestingUserId === membership.userId
              ? "MEMBERSHIP_LEAVE"
              : "MEMBERSHIP_REMOVE",
          target: "MEMBERSHIP",
          meta: JSON.stringify({
            targetUserId: membership.userId,
            clubId,
          }),
        },
      });

      return deleted;
    });

    return {
      success: true,
      message: "メンバーシップを削除しました",
    };
  } catch (error) {
    if (error instanceof MembershipApplicationError) {
      return {
        success: false,
        error: error.code,
        message: error.message,
      };
    }

    console.error("Membership deletion error:", error);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "削除に失敗しました",
    };
  }
}

/**
 * カスタムエラークラス
 */
class MembershipApplicationError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "MembershipApplicationError";
  }
}
