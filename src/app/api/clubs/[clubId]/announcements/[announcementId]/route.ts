import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { requireClubAdmin } from "@/lib/accessControl";
import { isClubAdminRole } from "@/lib/roleScopes";

// ピン留めトグル
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ clubId: string; announcementId: string }> }
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
    const announcementId = params.announcementId;

    // 管理者かチェック
    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "Only club admins can pin announcements" },
        { status: 403 }
      );
    }

    // お知らせが存在するか確認
    const announcement = await prisma.clubAnnouncement.findUnique({
      where: { id: announcementId },
    });

    if (!announcement || announcement.clubId !== clubId) {
      return NextResponse.json(
        { error: "Announcement not found" },
        { status: 404 }
      );
    }

    // ピン留め状態をトグル
    const updated = await prisma.clubAnnouncement.update({
      where: { id: announcementId },
      data: { isPinned: !announcement.isPinned },
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

    return NextResponse.json(updated);
  } catch (error) {
    return jsonInternalError500("PUT api/clubs/[clubId]/announcements/[announcementId]/route.ts", error);
  }
}

// お知らせ削除
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ clubId: string; announcementId: string }> }
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
    const announcementId = params.announcementId;

    // お知らせを取得
    const announcement = await prisma.clubAnnouncement.findUnique({
      where: { id: announcementId },
    });

    if (!announcement || announcement.clubId !== clubId) {
      return NextResponse.json(
        { error: "Announcement not found" },
        { status: 404 }
      );
    }

    // 管理者または投稿者本人かチェック
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

    const isAuthor = announcement.authorId === session.userId;
    const isClubAdmin = isClubAdminRole(membership.role);

    if (!isAuthor && !isClubAdmin) {
      return NextResponse.json(
        { error: "Only the author or admins can delete announcements" },
        { status: 403 }
      );
    }

    await prisma.clubAnnouncement.delete({
      where: { id: announcementId },
    });

    return NextResponse.json({ message: "Announcement deleted successfully" });
  } catch (error) {
    return jsonInternalError500("DELETE api/clubs/[clubId]/announcements/[announcementId]/route.ts", error);
  }
}
