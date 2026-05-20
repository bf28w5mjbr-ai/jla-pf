import type { OrgStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** 大会作成・本番運用を許可する主催団体 status */
export const ORG_OPERATIONAL_STATUS: OrgStatus = "APPROVED";

export class OrganizerLifecycleError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "OrganizerLifecycleError";
  }
}

type OrgDb = Prisma.TransactionClient | typeof prisma;

async function loadOrgStatus(db: OrgDb, organizationId: string) {
  return db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, status: true },
  });
}

function rejectIfSuspended(status: OrgStatus): void {
  if (status === "SUSPENDED" || status === "INACTIVE") {
    throw new OrganizerLifecycleError(
      "ORG_SUSPENDED",
      "この主催団体は現在停止中のため操作できません"
    );
  }
}

/**
 * 大会作成・Connect・公開・当日運用など本番操作向け（APPROVED のみ）。
 */
export async function assertOrgOperational(
  db: OrgDb,
  organizationId: string
): Promise<{ id: string; name: string }> {
  const org = await loadOrgStatus(db, organizationId);

  if (!org) {
    throw new OrganizerLifecycleError("ORG_NOT_FOUND", "主催団体が見つかりません");
  }

  rejectIfSuspended(org.status);

  if (org.status !== ORG_OPERATIONAL_STATUS) {
    throw new OrganizerLifecycleError(
      "ORG_NOT_OPERATIONAL",
      "正式化済みの主催団体のみこの操作ができます。登録手続き（オンボーディング）を完了してください。"
    );
  }

  return { id: org.id, name: org.name };
}

/**
 * 仮登録中でも許可するオンボーディング向け（PENDING / APPROVED、停止中は不可）。
 */
export async function assertOrgOnboardingAllowed(
  db: OrgDb,
  organizationId: string
): Promise<{ id: string; name: string; status: OrgStatus }> {
  const org = await loadOrgStatus(db, organizationId);

  if (!org) {
    throw new OrganizerLifecycleError("ORG_NOT_FOUND", "主催団体が見つかりません");
  }

  rejectIfSuspended(org.status);

  if (org.status !== "PENDING" && org.status !== ORG_OPERATIONAL_STATUS) {
    throw new OrganizerLifecycleError(
      "ORG_STATUS_INVALID",
      "この主催団体は現在操作を受け付けていません"
    );
  }

  return org;
}

/** @alias assertOrgOnboardingAllowed — プラン上の名称との対応 */
export const assertOrgEditableWhilePending = assertOrgOnboardingAllowed;

export function organizerLifecycleErrorStatus(code: string): number {
  switch (code) {
    case "ORG_NOT_FOUND":
      return 404;
    case "ORG_NOT_OPERATIONAL":
    case "ORG_SUSPENDED":
    case "ORG_STATUS_INVALID":
      return 403;
    default:
      return 400;
  }
}

export type OrgStatusTransitionAction = "suspend" | "restore";

/**
 * PF 管理者による主催団体停止 / 復旧。
 */
export async function transitionOrgStatus(
  organizationId: string,
  action: OrgStatusTransitionAction,
  actorUserId: string,
  suspendedReason?: string | null
): Promise<{ id: string; status: OrgStatus }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, status: true },
  });

  if (!org) {
    throw new OrganizerLifecycleError("ORG_NOT_FOUND", "主催団体が見つかりません");
  }

  const nextStatus: OrgStatus =
    action === "suspend" ? "SUSPENDED" : ORG_OPERATIONAL_STATUS;

  if (action === "suspend" && org.status === "SUSPENDED") {
    throw new OrganizerLifecycleError("INVALID_TRANSITION", "既に停止中です");
  }
  if (action === "restore" && org.status === ORG_OPERATIONAL_STATUS) {
    throw new OrganizerLifecycleError("INVALID_TRANSITION", "既に運用中です");
  }
  if (action === "restore" && org.status !== "SUSPENDED") {
    throw new OrganizerLifecycleError(
      "INVALID_TRANSITION",
      "停止中の主催団体のみ復旧できます"
    );
  }

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      status: nextStatus,
      ...(action === "restore"
        ? { suspendedReason: null }
        : { suspendedReason: suspendedReason ?? "PF_SUSPEND" }),
    },
    select: { id: true, status: true },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: action === "suspend" ? "ORG_SUSPEND" : "ORG_RESTORE",
      target: organizationId,
      meta: { previousStatus: org.status, nextStatus, suspendedReason: suspendedReason ?? null },
    },
  });

  return updated;
}
