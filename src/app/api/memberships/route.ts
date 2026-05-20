// src/app/api/memberships/route.ts
export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import type { MembershipRole, MembershipStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { z } from "zod";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import {
  applyForMembership,
  membershipServiceErrorStatus,
} from "@/lib/membershipService";

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
    const role = searchParams.get('role'); // 'ADMIN' | 'MEMBER'
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Prisma.MembershipWhereInput = {};

    if (clubId) {
      where.clubId = clubId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (status) {
      where.status = status as MembershipStatus;
    }

    if (role) {
      where.role = role as MembershipRole;
    }

    const [memberships, total] = await Promise.all([
      prisma.membership.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { familyName: true, givenName: true } },
              contact: { select: { phoneNumber: true } },
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
    return jsonInternalError500("GET api/memberships/route.ts", err);
  }
}

// POST /api/memberships - メンバーシップ申請（内部は join と同一。管理画面等向け）
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

    const result = await applyForMembership(sess.userId, data.clubId);

    if (!result.success || !result.membership) {
      return NextResponse.json(
        { error: result.message ?? "参加申請に失敗しました" },
        { status: membershipServiceErrorStatus(result.error) }
      );
    }

    return NextResponse.json(result.membership, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(err, "validation_message_ja"), { status: 400 });
    }

    return jsonInternalError500("POST api/memberships/route.ts", err);
  }
}
