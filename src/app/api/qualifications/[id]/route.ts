// src/app/api/qualifications/[id]/route.ts
export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";
import {
  buildQualificationPatchConcurrencyWhere,
  canPatchQualificationRecord,
  canViewQualificationAsReviewer,
  canWriteOfficialQualificationConfirmation,
  QUALIFICATION_UPDATE_CONFLICT,
  qualificationDetailSelect,
  qualificationHolderForViewer,
  qualificationHolderSelectForOwner,
  qualificationHolderSelectForReviewer,
  resolveQualificationAccessContext,
  resolveQualificationViewerKind,
  viewerIsQualificationPlatformReviewer,
} from "@/lib/qualificationAccess";
import { QualificationHistoryChangeType } from "@prisma/client";
import {
  buildConfirmationMutation,
  buildOwnerQualificationCancelWhere,
  canOwnerPhysicallyDeleteQualification,
  confirmationHistoryFields,
  QUALIFICATION_OWNER_CANCEL_CONFLICT,
} from "@/lib/qualificationOwnerRules";
import {
  isPlayerRegistrationKind,
  JLA_MEMBER_NUMBER_REGEX,
  normalizeJlaMemberNumber,
} from "@/lib/jlaMemberNumber";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/qualifications/[id] - 資格詳細取得
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const qualification = await prisma.qualification.findUnique({
      where: { id },
      select: {
        ...qualificationDetailSelect,
        template: true,
      },
    });

    if (!qualification) {
      return NextResponse.json(
        { error: '資格が見つかりません' },
        { status: 404 }
      );
    }

    const access = await resolveQualificationAccessContext(sess.userId);
    const viewer = resolveQualificationViewerKind({
      viewerUserId: sess.userId,
      holderUserId: qualification.userId,
      isReviewer: canViewQualificationAsReviewer(access, qualification.templateId),
    });

    if (!viewer) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const holder = await prisma.user.findUnique({
      where: { id: qualification.userId },
      select:
        viewer === "reviewer"
          ? qualificationHolderSelectForReviewer
          : qualificationHolderSelectForOwner,
    });

    if (!holder) {
      return NextResponse.json({ error: "資格が見つかりません" }, { status: 404 });
    }

    const { userId, ...record } = qualification;
    return NextResponse.json({
      ...record,
      userId,
      user: qualificationHolderForViewer(holder, viewer),
    });
  } catch (err) {
    return jsonInternalError500("GET api/qualifications/[id]/route.ts", err);
  }
}

// PATCH /api/qualifications/[id] - 資格更新（承認・却下）
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const access = await resolveQualificationAccessContext(sess.userId);
    if (!access.isPfAdmin && !access.isJlaReviewer) {
      return NextResponse.json(
        { error: "権限がありません" },
        { status: 403 }
      );
    }

    const { id } = await ctx.params;

    const qualification = await prisma.qualification.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        kind: true,
        templateId: true,
        status: true,
        certNumber: true,
        issueDate: true,
        expiryDate: true,
        attachmentUrl: true,
        recordOrigin: true,
        updatedAt: true,
        confirmedAt: true,
        confirmedByUserId: true,
        confirmedByAssociationId: true,
        confirmationMethod: true,
        confirmedTemplateId: true,
        confirmedCertNumber: true,
        confirmedExpiryDate: true,
        confirmationInvalidatedAt: true,
      },
    });

    if (!qualification) {
      return NextResponse.json(
        { error: '資格が見つかりません' },
        { status: 404 }
      );
    }

    if (!canPatchQualificationRecord(access, qualification.templateId)) {
      return NextResponse.json(
        { error: "権限がありません" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const UpdateQualificationSchema = z.object({
      status: z.enum(['APPROVED', 'REJECTED', 'EXPIRED']).optional(),
      certNumber: z
        .string()
        .optional()
        .transform((value) => {
          if (typeof value !== "string") return undefined;
          const normalized = value.trim();
          return normalized === "" ? undefined : normalized;
        }),
      jlaMemberNumber: z
        .string()
        .optional()
        .transform((value) => {
          if (typeof value !== "string") return undefined;
          const normalized = normalizeJlaMemberNumber(value);
          return normalized === "" ? undefined : normalized;
        }),
      issueDate: z.string().datetime().optional(),
      expiryDate: z.string().datetime().optional(),
      rejectionReason: z.string().optional(),
    }).strip();

    const data = UpdateQualificationSchema.parse(body);
    const approvingPlayerRegistration =
      data.status === "APPROVED" && isPlayerRegistrationKind(qualification.kind);

    if (approvingPlayerRegistration) {
      const userJlaProfile = await prisma.userJlaProfile.findUnique({
        where: { userId: qualification.userId },
        select: { jlaMemberNumber: true },
      });
      const nextJlaMemberNumber = data.jlaMemberNumber ?? userJlaProfile?.jlaMemberNumber ?? null;

      if (!nextJlaMemberNumber) {
        return NextResponse.json(
          { error: "選手登録の承認にはJLAメンバーIDが必要です" },
          { status: 400 }
        );
      }

      if (!JLA_MEMBER_NUMBER_REGEX.test(nextJlaMemberNumber)) {
        return NextResponse.json(
          { error: "JLAメンバーIDは500から始まる9桁の半角数字で入力してください" },
          { status: 400 }
        );
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          jlaProfile: { is: { jlaMemberNumber: nextJlaMemberNumber } },
          NOT: { id: qualification.userId },
        },
        select: { id: true },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: "このJLAメンバーIDは既に別の会員に紐づいています" },
          { status: 400 }
        );
      }
    }

    const concurrencyWhere = buildQualificationPatchConcurrencyWhere({
      id: qualification.id,
      userId: qualification.userId,
      templateId: qualification.templateId,
      updatedAt: qualification.updatedAt,
      isPfAdmin: access.isPfAdmin,
      reviewTemplateIds: access.reviewTemplateIds,
    });

    const nextStatus = data.status ?? qualification.status;
    const nextCertNumber =
      data.certNumber !== undefined ? data.certNumber ?? null : qualification.certNumber;
    const nextExpiryDate = data.expiryDate
      ? new Date(data.expiryDate)
      : data.expiryDate === undefined
        ? qualification.expiryDate
        : null;
    const writeOfficialConfirmation =
      data.status === "APPROVED" &&
      canWriteOfficialQualificationConfirmation(access, qualification.templateId);
    const confirmationData = buildConfirmationMutation({
      current: {
        ...qualification,
        certNumber: qualification.certNumber,
        expiryDate: qualification.expiryDate,
      },
      nextStatus,
      nextTemplateId: qualification.templateId,
      nextCertNumber,
      nextExpiryDate,
      canWriteOfficialConfirmation: writeOfficialConfirmation,
      actorUserId: sess.userId,
      associationId: access.reviewAssociationId,
      now: new Date(),
    });
    const wroteOfficialConfirmation = "confirmedAt" in confirmationData;
    const invalidateConfirmation =
      "confirmationInvalidatedAt" in confirmationData && !wroteOfficialConfirmation;

    const updated = await prisma.$transaction(async (tx) => {
      const scoped = await tx.qualification.updateMany({
        where: concurrencyWhere,
        data: {
          status: data.status,
          certNumber: data.certNumber,
          issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
          ...confirmationData,
        },
      });
      if (scoped.count !== 1) {
        throw new Error(QUALIFICATION_UPDATE_CONFLICT);
      }

      await tx.qualificationHistory.create({
        data: {
          qualificationId: qualification.id,
          sourceQualificationId: qualification.id,
          userId: qualification.userId,
          templateId: qualification.templateId,
          kind: qualification.kind,
          certNumber: qualification.certNumber,
          issueDate: qualification.issueDate,
          expiryDate: qualification.expiryDate,
          status: qualification.status,
          attachmentUrl: qualification.attachmentUrl,
          recordOrigin: qualification.recordOrigin,
          ...confirmationHistoryFields(qualification),
          changeType: invalidateConfirmation
            ? QualificationHistoryChangeType.CONFIRMATION_INVALIDATED
            : QualificationHistoryChangeType.STATUS_CHANGE,
        },
      });

      const updatedQualification = await tx.qualification.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { familyName: true, givenName: true } },
            },
          },
        },
      });
      if (!updatedQualification) {
        throw new Error(QUALIFICATION_UPDATE_CONFLICT);
      }

      if (approvingPlayerRegistration && data.jlaMemberNumber) {
        await tx.user.update({
          where: { id: qualification.userId },
          data: {
            jlaProfile: {
              upsert: {
                create: { jlaMemberNumber: data.jlaMemberNumber },
                update: { jlaMemberNumber: data.jlaMemberNumber },
              },
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: sess.userId,
          action:
            data.status === "APPROVED"
              ? "QUALIFICATION_APPROVE"
              : data.status === "REJECTED"
                ? "QUALIFICATION_REJECT"
                : "QUALIFICATION_UPDATE",
          target: `qualification:${id}`,
          meta: data,
        },
      });

      return updatedQualification;
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(err, "validation_message_ja"), { status: 400 });
    }
    if (err instanceof Error && err.message === QUALIFICATION_UPDATE_CONFLICT) {
      return NextResponse.json({ error: "更新が競合しました" }, { status: 409 });
    }

    return jsonInternalError500("PATCH api/qualifications/[id]/route.ts", err);
  }
}

// DELETE /api/qualifications/[id] - 資格削除
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const qualification = await prisma.qualification.findUnique({
      where: { id },
      select: {
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
      },
    });

    if (!qualification) {
      return NextResponse.json(
        { error: '資格が見つかりません' },
        { status: 404 }
      );
    }

    const isPfAdmin = await viewerIsQualificationPlatformReviewer(sess.userId);
    if (isPfAdmin) {
      await prisma.$transaction(async (tx) => {
        await tx.qualification.delete({
          where: { id },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: sess.userId,
            action: "QUALIFICATION_DELETE",
            target: `qualification:${id}`,
            meta: { deleted: true, asPlatformAdmin: true },
          },
        });
      });

      return NextResponse.json({ success: true });
    }

    if (qualification.userId !== sess.userId) {
      return NextResponse.json(
        { error: "権限がありません" },
        { status: 403 }
      );
    }

    if (!canOwnerPhysicallyDeleteQualification(qualification)) {
      return NextResponse.json(
        { error: "この資格は取消できません" },
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.qualificationHistory.create({
        data: {
          qualificationId: qualification.id,
          sourceQualificationId: qualification.id,
          userId: qualification.userId,
          templateId: qualification.templateId,
          kind: qualification.kind,
          certNumber: qualification.certNumber,
          issueDate: qualification.issueDate,
          expiryDate: qualification.expiryDate,
          status: qualification.status,
          attachmentUrl: qualification.attachmentUrl,
          recordOrigin: qualification.recordOrigin,
          ...confirmationHistoryFields(qualification),
          changeType: QualificationHistoryChangeType.STATUS_CHANGE,
        },
      });

      const scoped = await tx.qualification.deleteMany({
        where: buildOwnerQualificationCancelWhere({
          id: qualification.id,
          userId: sess.userId,
        }),
      });
      if (scoped.count !== 1) {
        throw new Error(QUALIFICATION_OWNER_CANCEL_CONFLICT);
      }

      await tx.auditLog.create({
        data: {
          actorUserId: sess.userId,
          action: "QUALIFICATION_DELETE",
          target: `qualification:${id}`,
          meta: {
            deleted: true,
            recordOrigin: qualification.recordOrigin,
            status: qualification.status,
          },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === QUALIFICATION_OWNER_CANCEL_CONFLICT) {
      return NextResponse.json({ error: "取消が競合しました" }, { status: 409 });
    }
    return jsonInternalError500("DELETE api/qualifications/[id]/route.ts", err);
  }
}
