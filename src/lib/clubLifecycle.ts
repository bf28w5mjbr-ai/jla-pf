import type { ClubStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** 日常運用・参加申請を受け付けるクラブ status */
export const CLUB_OPERATIONAL_STATUS: ClubStatus = "APPROVED";

export class ClubOperationalError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ClubOperationalError";
  }
}

/**
 * 参加申請・メンバー承認が可能なクラブか（成立かつ停止していない）。
 */
export async function assertClubOperational(
  tx: Prisma.TransactionClient,
  clubId: string
): Promise<{ id: string; name: string }> {
  const club = await tx.club.findUnique({
    where: { id: clubId },
    select: { id: true, status: true, name: true },
  });

  if (!club) {
    throw new ClubOperationalError("CLUB_NOT_FOUND", "クラブが見つかりません");
  }

  if (club.status !== CLUB_OPERATIONAL_STATUS) {
    throw new ClubOperationalError(
      "CLUB_NOT_ACCEPTING",
      "このクラブは現在参加申請を受け付けていません"
    );
  }

  return { id: club.id, name: club.name };
}

export type ClubStatusTransitionAction = "suspend" | "restore";

/**
 * PF 管理者によるクラブ停止 / 復旧のみ。
 */
export async function transitionClubStatus(
  clubId: string,
  action: ClubStatusTransitionAction,
  actorUserId: string
): Promise<{ id: string; status: ClubStatus }> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, status: true },
  });

  if (!club) {
    throw new ClubOperationalError("CLUB_NOT_FOUND", "クラブが見つかりません");
  }

  const nextStatus: ClubStatus =
    action === "suspend" ? "SUSPENDED" : CLUB_OPERATIONAL_STATUS;

  if (action === "suspend" && club.status === "SUSPENDED") {
    throw new ClubOperationalError("INVALID_TRANSITION", "既に停止中です");
  }
  if (action === "restore" && club.status === CLUB_OPERATIONAL_STATUS) {
    throw new ClubOperationalError("INVALID_TRANSITION", "既に運用中です");
  }
  if (action === "restore" && club.status !== "SUSPENDED") {
    throw new ClubOperationalError(
      "INVALID_TRANSITION",
      "停止中のクラブのみ復旧できます"
    );
  }

  const updated = await prisma.club.update({
    where: { id: clubId },
    data: {
      status: nextStatus,
      ...(action === "restore" ? { suspendedReason: null } : {}),
    },
    select: { id: true, status: true },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: action === "suspend" ? "CLUB_SUSPEND" : "CLUB_RESTORE",
      target: clubId,
      meta: { previousStatus: club.status, nextStatus },
    },
  });

  return updated;
}
