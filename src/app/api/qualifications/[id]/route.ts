// src/app/api/qualifications/[id]/route.ts
export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isPfOrAccAdmin, verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";
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
      include: {
        template: true,
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { familyName: true, givenName: true } },
            contact: { select: { phoneNumber: true } },
          },
        },
      },
    });

    if (!qualification) {
      return NextResponse.json(
        { error: '資格が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json(qualification);
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

    // 協会管理者（AssociationAdmin.ADMIN）/ PF管理者 権限チェック
    if (!(await isPfOrAccAdmin(sess.userId))) {
      return NextResponse.json(
        { error: '協会管理者権限が必要です' },
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
      },
    });

    if (!qualification) {
      return NextResponse.json(
        { error: '資格が見つかりません' },
        { status: 404 }
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
    });

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

    // 資格を更新
    const updated = await prisma.$transaction(async (tx) => {
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
          changeType: "STATUS_CHANGE",
        },
      });

      const updatedQualification = await tx.qualification.update({
        where: { id },
        data: {
          status: data.status,
          certNumber: data.certNumber,
          issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        },
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

      return updatedQualification;
    });

    // AuditLog 記録
    await prisma.auditLog.create({
      data: {
        actorUserId: sess.userId,
        action: data.status === 'APPROVED' ? 'QUALIFICATION_APPROVE' : 
                data.status === 'REJECTED' ? 'QUALIFICATION_REJECT' : 
                'QUALIFICATION_UPDATE',
        target: `qualification:${id}`,
        meta: data,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(err, "validation_message_ja"), { status: 400 });
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
      },
    });

    if (!qualification) {
      return NextResponse.json(
        { error: '資格が見つかりません' },
        { status: 404 }
      );
    }

    // 自分の資格かチェック
    if (qualification.userId !== sess.userId) {
      // 協会管理者 / PF管理者 ならOK
      if (!(await isPfOrAccAdmin(sess.userId))) {
        return NextResponse.json(
          { error: '権限がありません' },
          { status: 403 }
        );
      }
    }

    await prisma.qualification.delete({
      where: { id },
    });

    // AuditLog 記録
    await prisma.auditLog.create({
      data: {
        actorUserId: sess.userId,
        action: 'QUALIFICATION_DELETE',
        target: `qualification:${id}`,
        meta: { deleted: true },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return jsonInternalError500("DELETE api/qualifications/[id]/route.ts", err);
  }
}
