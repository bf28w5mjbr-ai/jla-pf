import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { notifyCompetitionAnnouncementPublished } from "@/lib/announcementNotification";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; announcementId: string }> }
) {
  try {
    const { announcementId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const announcement = await prisma.competitionAnnouncement.findUnique({
      where: { id: announcementId },
      include: {
        competition: {
          include: {
            organization: {
              include: {
                admins: {
                  where: { userId: session.userId },
                },
              },
            },
          },
        },
      },
    });

    if (!announcement) {
      return NextResponse.json(
        { error: "Announcement not found" },
        { status: 404 }
      );
    }

    if (!hasOrgAdminAccess(announcement.competition.organization.admins)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      content?: unknown;
      isPublished?: unknown;
    };
    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    const content = typeof body.content === "string" ? body.content.trim() : undefined;
    const hasPublished = typeof body.isPublished === "boolean";

    if (title !== undefined && title.length === 0) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (content !== undefined && content.length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }
    if (title === undefined && content === undefined && !hasPublished) {
      return NextResponse.json({ error: "No changes supplied" }, { status: 400 });
    }

    const updated = await prisma.competitionAnnouncement.update({
      where: { id: announcementId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(hasPublished
          ? { publishedAt: body.isPublished ? announcement.publishedAt ?? new Date() : null }
          : {}),
      },
    });

    if (!announcement.publishedAt && updated.publishedAt) {
      await notifyCompetitionAnnouncementPublished({
        announcementId: updated.id,
        competitionId: updated.competitionId,
        title: updated.title,
        content: updated.content,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/announcements/[announcementId]/route.ts", error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; announcementId: string }> }
) {
  try {
    const { announcementId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // お知らせを取得
    const announcement = await prisma.competitionAnnouncement.findUnique({
      where: { id: announcementId },
      include: {
        competition: {
          include: {
            organization: {
              include: {
                admins: {
                  where: { userId: session.userId },
                },
              },
            },
          },
        },
      },
    });

    if (!announcement) {
      return NextResponse.json(
        { error: "Announcement not found" },
        { status: 404 }
      );
    }

    // 権限チェック
    if (!hasOrgAdminAccess(announcement.competition.organization.admins)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 削除
    await prisma.competitionAnnouncement.delete({
      where: { id: announcementId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonInternalError500("DELETE api/competitions/[id]/announcements/[announcementId]/route.ts", error);
  }
}
