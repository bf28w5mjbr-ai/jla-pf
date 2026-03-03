// src/app/api/clubs/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";

// GET /api/clubs - クラブ一覧取得
export async function GET(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status'); // 'APPLYING' | 'JLA_APPROVED' | 'APPROVED' | 'INACTIVE' | 'SUSPENDED'
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};

    if (status) {
      where.status = status;
    }

    const [clubs, total] = await Promise.all([
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
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.club.count({ where }),
    ]);

    return NextResponse.json({
      clubs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (err) {
    console.error('Error in GET /api/clubs', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// POST /api/clubs - クラブ作成申請
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const CreateClubSchema = z.object({
      name: z.string().min(1),
      establishedYear: z.number().int().optional(),
      watchPlace: z.string().optional(),
      officeAddress: z.string().optional(),
      officeTel: z.string().optional(),
      officeAttention: z.string().optional(),
      kind: z.enum(['FIRST', 'SECOND', 'THIRD', 'FOURTH']).optional(),
    });

    const data = CreateClubSchema.parse(body);

    // 既存の申請中または承認済みクラブ確認（同名）
    const existing = await prisma.club.findFirst({
      where: {
        name: data.name,
        status: { in: ['APPLYING', 'JLA_APPROVED', 'APPROVED'] },
      },
    });

    if (existing) {
      if (existing.status === 'APPLYING') {
        return NextResponse.json(
          { error: '既に同じ名前のクラブが申請中です' },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          { error: '既に同じ名前のクラブが存在します' },
          { status: 400 }
        );
      }
    }

    // クラブ作成（APPLYING状態）
    const club = await prisma.club.create({
      data: {
        creatorId: sess.userId,
        name: data.name,
        establishedYear: data.establishedYear,
        patrolLocation: data.watchPlace,
        officeAddressLine1: data.officeAddress,
        officePhone: data.officeTel,
        mailingName: data.officeAttention,
        type: data.kind,
        status: 'APPLYING',
      },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            familyName: true,
            givenName: true,
          },
        },
      },
    });

    // AuditLog 記録
    await prisma.auditLog.create({
      data: {
        actorUserId: sess.userId,
        action: 'CLUB_APPLY',
        target: club.id,
        meta: { name: data.name },
      },
    });

    return NextResponse.json(club, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: err.issues },
        { status: 400 }
      );
    }

    console.error('Error in POST /api/clubs', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
