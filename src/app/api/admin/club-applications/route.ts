// src/app/api/admin/club-applications/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

// GET /api/admin/club-applications - クラブ申請一覧取得（PF_ADMINのみ）
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'APPLYING'; // デフォルトは申請中
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {
      registrationStatus: status,
    };

    const [applications, total] = await Promise.all([
      prisma.club.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              email: true,
              familyName: true,
              givenName: true,
              phoneNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' }, // 申請順
        take: limit,
        skip: offset,
      }),
      prisma.club.count({ where }),
    ]);

    return NextResponse.json({
      applications,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (err) {
    console.error('Error in GET /api/admin/club-applications', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
