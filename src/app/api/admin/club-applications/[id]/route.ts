// src/app/api/admin/club-applications/[id]/route.ts
export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

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
            profile: { select: { familyName: true, givenName: true } },
            contact: { select: { phoneNumber: true } },
            role: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: { select: { familyName: true, givenName: true } },
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

    const { creator, memberships, ...applicationFields } = application;
    return NextResponse.json({
      ...applicationFields,
      creator: creator
        ? {
            id: creator.id,
            email: creator.email,
            familyName: creator.profile?.familyName ?? null,
            givenName: creator.profile?.givenName ?? null,
            phoneNumber: creator.contact?.phoneNumber ?? null,
            role: creator.role,
          }
        : null,
      memberships: memberships.map((membership) => {
        const { user: memberUser, ...membershipFields } = membership;
        return {
          ...membershipFields,
          user: {
            id: memberUser.id,
            email: memberUser.email,
            familyName: memberUser.profile?.familyName ?? null,
            givenName: memberUser.profile?.givenName ?? null,
          },
        };
      }),
    });
  } catch (err) {
    return jsonInternalError500("GET api/admin/club-applications/[id]/route.ts", err);
  }
}

// PATCH /api/admin/club-applications/[id] - 廃止（クラブ成立審査は廃止）
export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "クラブ成立審査は廃止されました。PF のクラブ管理（/admin/clubs）で停止・復旧を行ってください。種別は協会の種別申請 API を使用してください。",
    },
    { status: 410 }
  );
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
        status: true,
        suspendedReason: true,
      },
    });

    if (!club) {
      return NextResponse.json(
        { error: 'クラブが見つかりません' },
        { status: 404 }
      );
    }

    // APPLYING または REJECTED のみ削除可能
    const isRejected = club.status === 'INACTIVE' && club.suspendedReason === 'REJECTED';
    if (club.status !== 'APPLYING' && !isRejected) {
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
    return jsonInternalError500("DELETE api/admin/club-applications/[id]/route.ts", err);
  }
}
