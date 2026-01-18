// src/app/api/memberships/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";

// GET /api/memberships - メンバーシップ一覧取得
export async function GET(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clubId = searchParams.get('clubId');
    const userId = searchParams.get('userId');
    const status = searchParams.get('status'); // 'PENDING' | 'APPROVED' | 'REJECTED'
    const role = searchParams.get('role'); // 'OWNER' | 'ADMIN' | 'MEMBER'
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};

    if (clubId) {
      where.clubId = clubId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (status) {
      where.status = status;
    }

    if (role) {
      where.role = role;
    }

    const [memberships, total] = await Promise.all([
      prisma.membership.findMany({
        where,
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
              prefectureCode: true,
              city: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.membership.count({ where }),
    ]);

    return NextResponse.json({
      memberships,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (err) {
    console.error('Error in GET /api/memberships', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// POST /api/memberships - メンバーシップ申請
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const ApplyMembershipSchema = z.object({
      clubId: z.string().min(1),
      message: z.string().optional(),
    });

    const data = ApplyMembershipSchema.parse(body);

    // クラブの存在確認
    const club = await prisma.club.findUnique({
      where: { id: data.clubId },
    });

    if (!club) {
      return NextResponse.json(
        { error: 'クラブが見つかりません' },
        { status: 404 }
      );
    }

    // 既存のメンバーシップ確認
    const existing = await prisma.membership.findFirst({
      where: {
        userId: sess.userId,
        clubId: data.clubId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    if (existing) {
      if (existing.status === 'APPROVED') {
        return NextResponse.json(
          { error: '既にクラブに所属しています' },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          { error: '既に申請済みです' },
          { status: 400 }
        );
      }
    }

    // メンバーシップ申請作成
    const membership = await prisma.membership.create({
      data: {
        userId: sess.userId,
        clubId: data.clubId,
        role: 'MEMBER',
        status: 'PENDING',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
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
        userId: sess.userId,
        action: 'MEMBERSHIP_APPLY',
        entityType: 'MEMBERSHIP',
        entityId: membership.id,
        changes: JSON.stringify({ clubId: data.clubId }),
      },
    });

    return NextResponse.json(membership, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: err.errors },
        { status: 400 }
      );
    }

    console.error('Error in POST /api/memberships', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
