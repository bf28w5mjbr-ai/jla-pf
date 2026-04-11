import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { requireClubAdmin } from "@/lib/accessControl";

// 活動記録一覧取得
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ clubId: string }> }
) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const params = await context.params;
    const clubId = params.clubId;

    // クラブメンバーかチェック
    const membership = await prisma.membership.findFirst({
      where: {
        clubId,
        userId: session.userId,
        status: "APPROVED",
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 活動記録一覧を取得（新しい順）
    const records = await prisma.clubActivityRecord.findMany({
      where: { clubId },
      include: {
        author: {
          select: {
            id: true,
            familyName: true,
            givenName: true,
          },
        },
      },
      orderBy: { activityDate: "desc" },
    });

    return NextResponse.json(records);
  } catch (error) {
    return jsonInternalError500("GET api/clubs/[clubId]/activities/route.ts", error);
  }
}

// 活動記録作成
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ clubId: string }> }
) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const params = await context.params;
    const clubId = params.clubId;

    // 管理者かチェック
    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "Only club admins can create activity records" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      activityType,
      title,
      description,
      activityDate,
      location,
      participants,
      achievements,
    } = body;

    if (!activityType?.trim() || !title?.trim() || !activityDate) {
      return NextResponse.json(
        { error: "Activity type, title, and date are required" },
        { status: 400 }
      );
    }

    const record = await prisma.clubActivityRecord.create({
      data: {
        clubId,
        authorId: session.userId,
        activityType: activityType.trim(),
        title: title.trim(),
        description: description?.trim() || null,
        activityDate: new Date(activityDate),
        location: location?.trim() || null,
        participants: participants ? parseInt(participants) : null,
        achievements: achievements?.trim() || null,
      },
      include: {
        author: {
          select: {
            id: true,
            familyName: true,
            givenName: true,
          },
        },
      },
    });

    return NextResponse.json(record);
  } catch (error) {
    return jsonInternalError500("POST api/clubs/[clubId]/activities/route.ts", error);
  }
}
