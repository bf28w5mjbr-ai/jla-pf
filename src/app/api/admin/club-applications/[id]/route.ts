// src/app/api/admin/club-applications/[id]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/admin/club-applications/[id] - クラブ申請詳細取得
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // PF_ADMIN権限チェック
    const user = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { role: true },
    });

    if (user?.role !== 'PF_ADMIN') {
      return NextResponse.json(
        { error: 'プラットフォーム管理者権限が必要です' },
        { status: 403 }
      );
    }

    const { id } = await ctx.params;

    const application = await prisma.club.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            familyName: true,
            givenName: true,
            phoneNumber: true,
            role: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                familyName: true,
                givenName: true,
              },
            },
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: 'クラブが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json(application);
  } catch (err) {
    console.error('Error in GET /api/admin/club-applications/[id]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// PATCH /api/admin/club-applications/[id] - クラブ申請の承認・却下
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // PF_ADMIN権限チェック
    const user = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { role: true },
    });

    if (user?.role !== 'PF_ADMIN') {
      return NextResponse.json(
        { error: 'プラットフォーム管理者権限が必要です' },
        { status: 403 }
      );
    }

    const { id } = await ctx.params;

    const club = await prisma.club.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        creatorId: true,
        status: true,
      },
    });

    if (!club) {
      return NextResponse.json(
        { error: 'クラブが見つかりません' },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const UpdateClubApplicationSchema = z.object({
      status: z.enum(['JLA_APPROVED', 'REJECTED']),
      rejectionReason: z.string().optional(),
    });

    const data = UpdateClubApplicationSchema.parse(body);

    // トランザクションで実行
    const result = await prisma.$transaction(async (tx) => {
      // クラブステータス更新
      const updatedClub = await tx.club.update({
        where: { id },
        data: {
          status: data.status,
        },
        include: {
          creator: {
            select: {
              id: true,
              email: true,
              familyName: true,
              givenName: true,
              role: true,
            },
          },
        },
      });

      // 承認の場合、申請者をクラブのOWNERとしてメンバーシップ作成
      if (data.status === 'JLA_APPROVED') {
        const existingMembership = await tx.membership.findFirst({
          where: {
            userId: club.creatorId,
            clubId: id,
          },
        });

        if (!existingMembership) {
          await tx.membership.create({
            data: {
              userId: club.creatorId,
              clubId: id,
              role: 'OWNER',
              status: 'APPROVED',
            },
          });
        }
      }

      // AuditLog 記録
      await tx.auditLog.create({
        data: {
          actorUserId: sess.userId,
          action: data.status === 'JLA_APPROVED' ? 'CLUB_APPROVE' : 'CLUB_REJECT',
          target: id,
          meta: {
            status: data.status,
            rejectionReason: data.rejectionReason,
          },
        },
      });

      return updatedClub;
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: err.issues },
        { status: 400 }
      );
    }

    console.error('Error in PATCH /api/admin/club-applications/[id]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// DELETE /api/admin/club-applications/[id] - クラブ申請削除（PF_ADMINのみ）
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // PF_ADMIN権限チェック
    const user = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { role: true },
    });

    if (user?.role !== 'PF_ADMIN') {
      return NextResponse.json(
        { error: 'プラットフォーム管理者権限が必要です' },
        { status: 403 }
      );
    }

    const { id } = await ctx.params;

    const club = await prisma.club.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        registrationStatus: true,
      },
    });

    if (!club) {
      return NextResponse.json(
        { error: 'クラブが見つかりません' },
        { status: 404 }
      );
    }

    // APPLYING または REJECTED のみ削除可能
    if (club.registrationStatus !== 'APPLYING' && club.registrationStatus !== 'REJECTED') {
      return NextResponse.json(
        { error: '承認済みまたは運用中のクラブは削除できません' },
        { status: 400 }
      );
    }

    await prisma.club.delete({
      where: { id },
    });

    // AuditLog 記録
    await prisma.auditLog.create({
      data: {
        actorUserId: sess.userId,
        action: 'CLUB_DELETE',
        target: id,
        meta: { name: club.name },
      },
    });

    return NextResponse.json({ message: '削除しました' });
  } catch (err) {
    console.error('Error in DELETE /api/admin/club-applications/[id]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
