// src/app/api/memberships/[id]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/memberships/[id] - メンバーシップ詳細取得
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const membership = await prisma.membership.findUnique({
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
        club: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            officePrefecture: true,
            officeCity: true,
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'メンバーシップが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json(membership);
  } catch (err) {
    console.error('Error in GET /api/memberships/[id]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// PATCH /api/memberships/[id] - メンバーシップ更新（承認・却下・ロール変更）
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const membership = await prisma.membership.findUnique({
      where: { id },
      select: {
        id: true,
        clubId: true,
        userId: true,
        status: true,
        role: true,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'メンバーシップが見つかりません' },
        { status: 404 }
      );
    }

    // 権限チェック（クラブのOWNERまたはADMIN）
    const adminMembership = await prisma.membership.findFirst({
      where: {
        userId: sess.userId,
        clubId: membership.clubId,
        role: { in: ['OWNER', 'ADMIN'] },
        status: 'APPROVED',
      },
    });

    if (!adminMembership) {
      return NextResponse.json(
        { error: 'クラブの管理者権限がありません' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const UpdateMembershipSchema = z.object({
      status: z.enum(['APPROVED', 'REJECTED']).optional(),
      role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).optional(),
    });

    const data = UpdateMembershipSchema.parse(body);

    // ステータスまたはロールを更新
    const updated = await prisma.membership.update({
      where: { id },
      data: {
        status: data.status,
        role: data.role,
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
        club: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // AuditLog 記録
    await prisma.auditLog.create({
      data: {
        actorUserId: sess.userId,
        action: data.status === 'APPROVED' ? 'MEMBERSHIP_APPROVE' : 
                data.status === 'REJECTED' ? 'MEMBERSHIP_REJECT' : 
                'MEMBERSHIP_UPDATE',
        target: `membership:${id}`,
        meta: data,
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

    console.error('Error in PATCH /api/memberships/[id]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// DELETE /api/memberships/[id] - メンバーシップ削除（退会）
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const membership = await prisma.membership.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        clubId: true,
        role: true,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'メンバーシップが見つかりません' },
        { status: 404 }
      );
    }

    // 自分のメンバーシップか、クラブ管理者かをチェック
    const isOwnMembership = membership.userId === sess.userId;
    
    const adminMembership = !isOwnMembership ? await prisma.membership.findFirst({
      where: {
        userId: sess.userId,
        clubId: membership.clubId,
        role: { in: ['OWNER', 'ADMIN'] },
        status: 'APPROVED',
      },
    }) : null;

    if (!isOwnMembership && !adminMembership) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    // OWNER の場合、他に OWNER がいるか確認
    if (membership.role === 'OWNER') {
      const otherOwners = await prisma.membership.count({
        where: {
          clubId: membership.clubId,
          role: 'OWNER',
          status: 'APPROVED',
          id: { not: id },
        },
      });

      if (otherOwners === 0) {
        return NextResponse.json(
          { error: '唯一のオーナーは退会できません。別のオーナーを指定してください' },
          { status: 400 }
        );
      }
    }

    await prisma.membership.delete({
      where: { id },
    });

    // AuditLog 記録
    await prisma.auditLog.create({
      data: {
        actorUserId: sess.userId,
        action: 'MEMBERSHIP_DELETE',
        target: `membership:${id}`,
        meta: { deleted: true },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/memberships/[id]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
