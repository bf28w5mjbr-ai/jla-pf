/**
 * 資格 API の閲覧範囲。
 * 資格レコード自体と、保有者の連絡先（メール・電話）は別レイヤとして扱う。
 *
 * 横断審査者:
 * - PF_ADMIN: 全資格
 * - JLA 審査者: 明示設定の協会 ADMIN かつ、templateId が許可リストに含まれる行のみ
 * 設定欠落時は協会審査を許可しない（Fail Closed）。
 */

import type { Prisma, QualificationStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import {
  JLA_ASSOCIATION_CANONICAL_NAME,
  isTemplateIdInReviewAllowlist,
  parseQualificationReviewConfig,
} from "@/lib/qualificationReviewConfig";

export const qualificationDetailSelect = {
  id: true,
  userId: true,
  kind: true,
  templateId: true,
  certNumber: true,
  issueDate: true,
  expiryDate: true,
  status: true,
  attachmentUrl: true,
  recordOrigin: true,
  confirmedAt: true,
  confirmedByUserId: true,
  confirmedByAssociationId: true,
  confirmationMethod: true,
  confirmedTemplateId: true,
  confirmedCertNumber: true,
  confirmedExpiryDate: true,
  confirmationInvalidatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const qualificationHolderSelectForReviewer = {
  id: true,
  email: true,
  profile: { select: { familyName: true, givenName: true } },
} as const;

export const qualificationHolderSelectForOwner = {
  id: true,
} as const;

/** 管理画面 JLA キュー。電話は select しない。 */
export const qualificationAdminQueueUserSelectForJla = {
  id: true,
  email: true,
  profile: { select: { familyName: true, givenName: true } },
} as const;

/** PF キュー。既存どおり電話を含めうる。 */
export const qualificationAdminQueueUserSelectForPf = {
  id: true,
  email: true,
  profile: { select: { familyName: true, givenName: true } },
  contact: { select: { phoneNumber: true } },
} as const;

export const QUALIFICATION_UPDATE_CONFLICT = "QUALIFICATION_UPDATE_CONFLICT";

export type QualificationViewerKind = "owner" | "reviewer";

export type QualificationAccessContext = {
  isPfAdmin: boolean;
  isJlaReviewer: boolean;
  reviewAssociationId: string | null;
  reviewTemplateIds: readonly string[];
};

export function isQualificationOwner(viewerUserId: string, holderUserId: string): boolean {
  return viewerUserId === holderUserId;
}

/** 他人削除・PF横断審査。協会審査者フラグとは共有しない。 */
export function isQualificationPlatformReviewer(role: string | null | undefined): boolean {
  return role === "PF_ADMIN";
}

export async function viewerIsQualificationPlatformReviewer(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return isQualificationPlatformReviewer(user?.role);
}

/**
 * リクエストごとに協会・設定を再読込する。永続キャッシュしない。
 */
export async function resolveQualificationAccessContext(
  userId: string
): Promise<QualificationAccessContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  const isPfAdmin = isQualificationPlatformReviewer(user?.role);
  const deniedAssociation: QualificationAccessContext = {
    isPfAdmin,
    isJlaReviewer: false,
    reviewAssociationId: null,
    reviewTemplateIds: [],
  };

  const config = parseQualificationReviewConfig();
  if (!config) return deniedAssociation;

  const association = await prisma.association.findUnique({
    where: { id: config.associationId },
    select: { id: true, name: true, status: true },
  });
  if (
    !association ||
    association.name !== JLA_ASSOCIATION_CANONICAL_NAME ||
    association.status !== "APPROVED"
  ) {
    return deniedAssociation;
  }

  const adminRow = await prisma.associationAdmin.findUnique({
    where: {
      userId_associationId: {
        userId,
        associationId: association.id,
      },
    },
    select: { role: true },
  });
  if (adminRow?.role !== "ADMIN") {
    return deniedAssociation;
  }

  return {
    isPfAdmin,
    isJlaReviewer: true,
    reviewAssociationId: association.id,
    reviewTemplateIds: config.templateIds,
  };
}

/**
 * 公式確認を書いてよいのは協会審査者かつ許可 template。
 * PF フラグだけでは不可。PF 兼 JLA でも協会・役割・template を別途満たす必要がある。
 */
export function canWriteOfficialQualificationConfirmation(
  access: QualificationAccessContext,
  templateId: string
): boolean {
  if (!access.isJlaReviewer || !access.reviewAssociationId) return false;
  return isTemplateIdInReviewAllowlist(templateId, access.reviewTemplateIds);
}

export function canViewQualificationAsReviewer(
  access: QualificationAccessContext,
  templateId: string
): boolean {
  if (access.isPfAdmin) return true;
  return access.isJlaReviewer && isTemplateIdInReviewAllowlist(templateId, access.reviewTemplateIds);
}

export function canPatchQualificationRecord(
  access: QualificationAccessContext,
  templateId: string
): boolean {
  return canViewQualificationAsReviewer(access, templateId);
}

export function resolveQualificationViewerKind(input: {
  viewerUserId: string;
  holderUserId: string;
  isReviewer: boolean;
}): QualificationViewerKind | null {
  if (input.isReviewer) return "reviewer";
  if (isQualificationOwner(input.viewerUserId, input.holderUserId)) return "owner";
  return null;
}

/** レスポンスに載せてよい保有者情報。電話番号はどの閲覧者にも含めない。 */
export function qualificationHolderForViewer<
  T extends { id: string; email?: string; profile?: { familyName: string | null; givenName: string | null } | null },
>(holder: T, viewer: QualificationViewerKind): Record<string, unknown> {
  if (viewer === "reviewer") {
    return {
      id: holder.id,
      email: holder.email ?? null,
      profile: holder.profile ?? null,
    };
  }
  return { id: holder.id };
}

export function buildQualificationListPermissionWhere(input: {
  viewerUserId: string;
  access: QualificationAccessContext;
  requestedUserId: string | null;
  kind: string | null;
  status: QualificationStatus | null;
}): Prisma.QualificationWhereInput | "forbidden" {
  const { viewerUserId, access, requestedUserId, kind, status } = input;

  if (requestedUserId && requestedUserId !== viewerUserId && !access.isPfAdmin && !access.isJlaReviewer) {
    return "forbidden";
  }

  const filters: Prisma.QualificationWhereInput[] = [];
  if (kind) filters.push({ kind });
  if (status) filters.push({ status });
  if (requestedUserId) filters.push({ userId: requestedUserId });

  if (access.isPfAdmin) {
    return filters.length > 0 ? { AND: filters } : {};
  }

  const permissionOr: Prisma.QualificationWhereInput[] = [{ userId: viewerUserId }];
  if (access.isJlaReviewer) {
    permissionOr.push({ templateId: { in: [...access.reviewTemplateIds] } });
  }

  return {
    AND: [...filters, { OR: permissionOr }],
  };
}

export function jlaAdminPendingQueueWhere(
  access: QualificationAccessContext
): Prisma.QualificationWhereInput {
  return {
    status: "PENDING",
    templateId: { in: [...access.reviewTemplateIds] },
  };
}

export function jlaAdminPendingFindManyArgs(access: QualificationAccessContext): {
  where: Prisma.QualificationWhereInput;
  include: {
    template: { select: { name: true; kind: true } };
    user: { select: typeof qualificationAdminQueueUserSelectForJla };
  };
  orderBy: { createdAt: "asc" };
} {
  return {
    where: jlaAdminPendingQueueWhere(access),
    include: {
      template: { select: { name: true, kind: true } },
      user: { select: qualificationAdminQueueUserSelectForJla },
    },
    orderBy: { createdAt: "asc" },
  };
}

export function mapJlaAdminQueueRowToTableUser(user: {
  id: string;
  email: string;
  profile: { familyName: string | null; givenName: string | null } | null;
}): {
  id: string;
  email: string;
  familyName: string | null;
  givenName: string | null;
} {
  return {
    id: user.id,
    email: user.email,
    familyName: user.profile?.familyName ?? null,
    givenName: user.profile?.givenName ?? null,
  };
}

export function buildQualificationPatchConcurrencyWhere(input: {
  id: string;
  userId: string;
  templateId: string;
  updatedAt: Date;
  isPfAdmin: boolean;
  reviewTemplateIds: readonly string[];
}): Prisma.QualificationWhereInput {
  const identity: Prisma.QualificationWhereInput = {
    id: input.id,
    userId: input.userId,
    templateId: input.templateId,
    updatedAt: input.updatedAt,
  };
  if (input.isPfAdmin) return identity;
  return {
    AND: [identity, { templateId: { in: [...input.reviewTemplateIds] } }],
  };
}
