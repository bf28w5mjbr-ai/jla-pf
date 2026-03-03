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
              givenName: true,
              familyName: true,
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

    const normalize = (value: string | null | undefined) =>
      (value ?? "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\s_\-./()（）・]+/g, "");

    const matchesKeywords = (value: string | null | undefined, keywords: string[]) => {
      const normalizedValue = normalize(value);
      if (!normalizedValue) return false;
      return keywords.some((keyword) => {
        const normalizedKeyword = normalize(keyword);
        return (
          normalizedValue === normalizedKeyword ||
          normalizedValue.includes(normalizedKeyword) ||
          normalizedKeyword.includes(normalizedValue)
        );
      });
    };

    const qualificationKinds = [
      {
        canonical: "選手登録",
        keywords: ["選手登録", "player registration", "player_registration"],
      },
      {
        canonical: "BLS・WS",
        keywords: ["BLS・WS", "BLS/WS", "BLS WS", "blsws", "bls ws", "ベーシックライフセーバー", "basic lifesaver", "bls"],
      },
      {
        canonical: "認定ライフセーバー",
        keywords: ["認定ライフセーバー", "certified lifesaver", "cls"],
      },
    ];

    const requestedKind = qualificationKinds.find((item) =>
      matchesKeywords(data.kind, item.keywords)
    );

    if (!requestedKind) {
      return NextResponse.json(
        { error: "登録できる資格は選手登録・BLS・WS・認定ライフセーバーのみです" },
        { status: 400 }
      );
    }

    const existingQualifications = await prisma.qualification.findMany({
      where: {
        userId: sess.userId,
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: {
        kind: true,
        status: true,
        expiryDate: true,
      },
    });

    const existingMatch = existingQualifications.find((qualification) =>
      matchesKeywords(qualification.kind, requestedKind.keywords)
    );

    if (existingMatch) {
      if (existingMatch.status === "APPROVED") {
        return NextResponse.json(
          { error: "既にこの資格を保有しています" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "既に申請済みです" },
        { status: 400 }
      );
    }

    if (requestedKind.canonical === "BLS・WS") {
      const lifesaverQualification = existingQualifications.find((qualification) =>
        matchesKeywords(qualification.kind, ["認定ライフセーバー", "certified lifesaver", "cls"])
      );

      if (lifesaverQualification?.status === "APPROVED") {
        const expiryDate = lifesaverQualification.expiryDate
          ? new Date(lifesaverQualification.expiryDate)
          : null;
        const isExpired = expiryDate ? expiryDate.getTime() < Date.now() : false;

        if (!isExpired) {
          return NextResponse.json(
            { error: "認定ライフセーバーを保有しているためBLS・WSは不要です" },
            { status: 400 }
          );
        }
      }
    }

    // 資格申請作成
    const qualification = await prisma.qualification.create({
      data: {
        userId: sess.userId,
        kind: requestedKind.canonical,
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
            givenName: true,
            familyName: true,
          },
        },
      },
    });

    // AuditLog 記録
    await prisma.auditLog.create({
      data: {
        actorUserId: sess.userId,
        action: 'QUALIFICATION_APPLY',
        target: `qualification:${qualification.id}`,
        meta: { kind: requestedKind.canonical },
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
