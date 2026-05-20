// src/app/api/clubs/route.ts
export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import type { ClubStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { z } from "zod";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

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

    const where: Prisma.ClubWhereInput = {};

    if (status) {
      where.status = status as ClubStatus;
    }

    const [clubs, total] = await Promise.all([
      prisma.club.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              email: true,
              profile: { select: { familyName: true, givenName: true } },
              contact: { select: { phoneNumber: true } },
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
    return jsonInternalError500("GET api/clubs/route.ts", err);
  }
}

// POST /api/clubs - 廃止（POST /api/clubs/create を使用）
export async function POST() {
  return NextResponse.json(
    {
      error:
        "このエンドポイントは廃止されました。POST /api/clubs/create を使用してください。",
    },
    { status: 410 }
  );
}
