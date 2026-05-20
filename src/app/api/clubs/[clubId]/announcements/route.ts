import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { requireClubAdmin } from "@/lib/accessControl";
import { notifyClubAnnouncementPublished } from "@/lib/announcementNotification";

// お知らせ一覧取得
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

    const isAdmin = membership.role === "ADMIN";

    // お知らせ一覧を取得（ピン留め優先、その後は新しい順）
    const announcements = await prisma.clubAnnouncement.findMany({
      where: {
        clubId,
        ...(isAdmin ? {} : { publishedAt: { not: null } }),
      },
      include: {
        author: {
          select: {
            id: true,
            profile: { select: { familyName: true, givenName: true } },
          },
        },
      },
      orderBy: [
        { isPinned: "desc" },
        { publishedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(announcements);
  } catch (error) {
    return jsonInternalError500("GET api/clubs/[clubId]/announcements/route.ts", error);
  }
}

// お知らせ作成
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
        { error: "Only club admins can create announcements" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, content, isPinned, isPublished } = body;

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    const announcement = await prisma.clubAnnouncement.create({
      data: {
        clubId,
        authorId: session.userId,
        title: title.trim(),
        content: content.trim(),
        isPinned: isPinned ?? false,
        publishedAt: isPublished === false ? null : new Date(),
      },
      include: {
        author: {
          select: {
            id: true,
            profile: { select: { familyName: true, givenName: true } },
          },
        },
      },
    });

    if (announcement.publishedAt) {
      await notifyClubAnnouncementPublished({
        announcementId: announcement.id,
        clubId,
        title: announcement.title,
        content: announcement.content,
        authorId: session.userId,
      });
    }

    return NextResponse.json(announcement);
  } catch (error) {
    return jsonInternalError500("POST api/clubs/[clubId]/announcements/route.ts", error);
  }
}
