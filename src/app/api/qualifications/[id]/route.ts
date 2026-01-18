// src/app/api/qualifications/[id]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";

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
        user: {
          select: {
            id: true,
            email: true,
            givenName: true,
            familyName: true,
            phoneNumber: true,
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
    console.error('Error in GET /api/qualifications/[id]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
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

    // ORG_ADMIN または PF_ADMIN 権限チェック
    const user = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { role: true }
    });

    if (user?.role !== 'PF_ADMIN' && user?.role !== 'ORG_ADMIN') {
      return NextResponse.json(
        { error: 'JLA管理者権限が必要です' },
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
        status: true,
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
      certNumber: z.string().optional(),
      issueDate: z.string().datetime().optional(),
      expiryDate: z.string().datetime().optional(),
      rejectionReason: z.string().optional(),
    });

    const data = UpdateQualificationSchema.parse(body);

    // 資格を更新
    const updated = await prisma.qualification.update({
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
            givenName: true,
            familyName: true,
          },
        },
      },
    });

    // AuditLog 記録
    await prisma.auditLog.create({
      data: {
        userId: sess.userId,
        action: data.status === 'APPROVED' ? 'QUALIFICATION_APPROVE' : 
                data.status === 'REJECTED' ? 'QUALIFICATION_REJECT' : 
                'QUALIFICATION_UPDATE',
        entityType: 'QUALIFICATION',
        entityId: id,
        changes: JSON.stringify(data),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: err.errors },
        { status: 400 }
      );
    }

    console.error('Error in PATCH /api/qualifications/[id]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
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
      // ORG_ADMIN または PF_ADMIN ならOK
      const user = await prisma.user.findUnique({
        where: { id: sess.userId },
        select: { role: true }
      });

      if (user?.role !== 'PF_ADMIN' && user?.role !== 'ORG_ADMIN') {
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
        userId: sess.userId,
        action: 'QUALIFICATION_DELETE',
        entityType: 'QUALIFICATION',
        entityId: id,
        changes: JSON.stringify({ deleted: true }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/qualifications/[id]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
