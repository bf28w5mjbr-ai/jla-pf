// src/app/api/memberships/[id]/route.ts
export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";
import { isClubAdminRole, normalizeClubRoleForWrite } from "@/lib/roleScopes";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

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
    return jsonInternalError500("GET api/memberships/[id]/route.ts", err);
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

    // 権限チェック（クラブ管理者）
    const adminMembership = await prisma.membership.findFirst({
      where: {
        userId: sess.userId,
        clubId: membership.clubId,
        status: 'APPROVED',
      },
    });

    if (!adminMembership || !isClubAdminRole(adminMembership.role)) {
      return NextResponse.json(
        { error: 'クラブの管理者権限がありません' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const UpdateMembershipSchema = z.object({
      status: z.enum(['APPROVED', 'REJECTED']).optional(),
      role: z.enum(['ADMIN', 'MEMBER']).optional(),
    });

    const data = UpdateMembershipSchema.parse(body);

    // ステータスまたはロールを更新
    const updated = await prisma.membership.update({
      where: { id },
      data: {
        status: data.status,
        role: data.role ? normalizeClubRoleForWrite(data.role) : undefined,
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
      return NextResponse.json(zodErrorJsonBody(err, "validation_message_ja"), { status: 400 });
    }

    return jsonInternalError500("PATCH api/memberships/[id]/route.ts", err);
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

    const adminMembership = await prisma.membership.findFirst({
      where: {
        userId: sess.userId,
        clubId: membership.clubId,
        status: "APPROVED",
      },
    });

    if (!adminMembership || !isClubAdminRole(adminMembership.role)) {
      return NextResponse.json(
        { error: "クラブ管理者のみがメンバーを削除できます" },
        { status: 403 }
      );
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
    return jsonInternalError500("DELETE api/memberships/[id]/route.ts", err);
  }
}
