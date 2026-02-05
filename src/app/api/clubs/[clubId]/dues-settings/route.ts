import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAuditAction, getRequestContext } from '@/lib/auditLog';
import { requireClubAdmin } from '@/lib/accessControl';

const createSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2000).max(3000),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  membershipFee: z.coerce.number().int().min(0).optional(),
  membershipFeeAppliesTo: z.enum(['ALL_MEMBERS', 'SELECTED']).optional(),
  description: z.string().max(2000).optional().nullable(),
});

const updateSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2000).max(3000),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  membershipFee: z.coerce.number().int().min(0).optional(),
  membershipFeeAppliesTo: z.enum(['ALL_MEMBERS', 'SELECTED']).optional(),
  description: z.string().max(2000).optional().nullable(),
});

// クラブ会費設定取得
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
    const token = req.cookies.get('session')?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const fiscalYearRaw = searchParams.get('fiscalYear');
    const fiscalYear = fiscalYearRaw
      ? Number(fiscalYearRaw)
      : new Date().getFullYear();

    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 3000) {
      return NextResponse.json({ error: 'fiscalYearが不正です' }, { status: 400 });
    }

    const setting = await prisma.clubFiscalYear.findUnique({
      where: {
        clubId_fiscalYear: { clubId, fiscalYear },
      },
    });

    if (!setting) {
      return NextResponse.json({ error: '会費設定が見つかりません' }, { status: 404 });
    }

    return NextResponse.json(setting);
  } catch (error) {
    console.error('GET /api/clubs/[clubId]/dues-settings error:', error);
    return NextResponse.json({ error: '会費設定の取得に失敗しました' }, { status: 500 });
  }
}

// クラブ会費設定作成
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
    const token = req.cookies.get('session')?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await req.json();
    const data = createSchema.parse(body);

    if (data.startDate >= data.endDate) {
      return NextResponse.json({ error: '開始日は終了日より前である必要があります' }, { status: 400 });
    }

    const created = await prisma.clubFiscalYear.create({
      data: {
        clubId,
        fiscalYear: data.fiscalYear,
        startDate: data.startDate,
        endDate: data.endDate,
        membershipFee: data.membershipFee ?? 0,
        membershipFeeAppliesTo: data.membershipFeeAppliesTo ?? 'ALL_MEMBERS',
        description: data.description ?? undefined,
      },
    });

    await logAuditAction({
      action: 'CLUB_DUES_SETTINGS_CREATE',
      actorType: 'USER',
      actorKey: `user:${session.userId}`,
      targetType: 'ClubFiscalYear',
      targetId: created.id,
      targetKey: `club:${clubId}`,
      metadata: { clubId, fiscalYear: created.fiscalYear },
      request: getRequestContext(req),
      result: 'SUCCESS',
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'validation_error', details: error.errors }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'この年度の設定は既に存在します' }, { status: 409 });
    }
    console.error('POST /api/clubs/[clubId]/dues-settings error:', error);
    return NextResponse.json({ error: '会費設定の作成に失敗しました' }, { status: 500 });
  }
}

// クラブ会費設定更新
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
    const token = req.cookies.get('session')?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await req.json();
    const data = updateSchema.parse(body);

    const existing = await prisma.clubFiscalYear.findUnique({
      where: {
        clubId_fiscalYear: { clubId, fiscalYear: data.fiscalYear },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: '会費設定が見つかりません' }, { status: 404 });
    }

    const nextStart = data.startDate ?? existing.startDate;
    const nextEnd = data.endDate ?? existing.endDate;
    if (nextStart >= nextEnd) {
      return NextResponse.json({ error: '開始日は終了日より前である必要があります' }, { status: 400 });
    }

    const updated = await prisma.clubFiscalYear.update({
      where: {
        clubId_fiscalYear: { clubId, fiscalYear: data.fiscalYear },
      },
      data: {
        startDate: data.startDate,
        endDate: data.endDate,
        membershipFee: data.membershipFee,
        membershipFeeAppliesTo: data.membershipFeeAppliesTo,
        description: data.description === null ? null : data.description,
      },
    });

    await logAuditAction({
      action: 'CLUB_DUES_SETTINGS_UPDATE',
      actorType: 'USER',
      actorKey: `user:${session.userId}`,
      targetType: 'ClubFiscalYear',
      targetId: updated.id,
      targetKey: `club:${clubId}`,
      metadata: { clubId, fiscalYear: updated.fiscalYear },
      request: getRequestContext(req),
      result: 'SUCCESS',
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'validation_error', details: error.errors }, { status: 400 });
    }
    console.error('PUT /api/clubs/[clubId]/dues-settings error:', error);
    return NextResponse.json({ error: '会費設定の更新に失敗しました' }, { status: 500 });
  }
}
