// src/app/api/qualifications/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";

// GET /api/qualifications - 資格一覧取得
export async function GET(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const kind = searchParams.get('kind');
    const status = searchParams.get('status'); // 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (kind) {
      where.kind = kind;
    }

    if (status) {
      where.status = status;
    }

    const [qualifications, total] = await Promise.all([
      prisma.qualification.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.qualification.count({ where }),
    ]);

    return NextResponse.json({
      qualifications,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (err) {
    console.error('Error in GET /api/qualifications', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// POST /api/qualifications - 資格申請
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const CreateQualificationSchema = z.object({
      kind: z.string().min(1),
      certNumber: z.string().optional(),
      issueDate: z.string().datetime().optional(),
      expiryDate: z.string().datetime().optional(),
      attachmentUrl: z.string().url().optional(),
    });

    const data = CreateQualificationSchema.parse(body);

    // 重複チェック（同じ種類で APPROVED または PENDING）
    const existing = await prisma.qualification.findFirst({
      where: {
        userId: sess.userId,
        kind: data.kind,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    if (existing) {
      if (existing.status === 'APPROVED') {
        return NextResponse.json(
          { error: '既にこの資格を保有しています' },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          { error: '既に申請済みです' },
          { status: 400 }
        );
      }
    }

    // 資格申請作成
    const qualification = await prisma.qualification.create({
      data: {
        userId: sess.userId,
        kind: data.kind,
        certNumber: data.certNumber,
        issueDate: data.issueDate ? new Date(data.issueDate) : null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
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
      },
    });

    // AuditLog 記録
    await prisma.auditLog.create({
      data: {
        userId: sess.userId,
        action: 'QUALIFICATION_APPLY',
        entityType: 'QUALIFICATION',
        entityId: qualification.id,
        changes: JSON.stringify({ kind: data.kind }),
      },
    });

    return NextResponse.json(qualification, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: err.errors },
        { status: 400 }
      );
    }

    console.error('Error in POST /api/qualifications', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
