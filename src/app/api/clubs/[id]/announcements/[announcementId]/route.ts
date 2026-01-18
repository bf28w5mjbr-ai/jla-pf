import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

// ピン留めトグル
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; announcementId: string }> }
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
    const clubId = params.id;
    const announcementId = params.announcementId;

    // OWNER/ADMINかチェック
    const membership = await prisma.membership.findFirst({
      where: {
        clubId,
        userId: session.userId,
        status: "APPROVED",
        role: { in: ["OWNER", "ADMIN"] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Only club owners and admins can pin announcements" },
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
    console.error("Pin announcement error:", error);
    return NextResponse.json(
      { error: "Failed to pin announcement" },
      { status: 500 }
    );
  }
}

// お知らせ削除
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; announcementId: string }> }
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
    const clubId = params.id;
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

    // OWNER/ADMINまたは投稿者本人かチェック
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
    const isOwnerOrAdmin = membership.role === "OWNER" || membership.role === "ADMIN";

    if (!isAuthor && !isOwnerOrAdmin) {
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
    console.error("Delete announcement error:", error);
    return NextResponse.json(
      { error: "Failed to delete announcement" },
      { status: 500 }
    );
  }
}
