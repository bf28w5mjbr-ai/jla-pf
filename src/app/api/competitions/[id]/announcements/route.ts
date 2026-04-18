import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { notifyCompetitionAnnouncementPublished } from "@/lib/announcementNotification";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      content?: unknown;
      isPublished?: unknown;
    };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const isPublished = typeof body.isPublished === "boolean" ? body.isPublished : true;

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    // 大会と権限チェック
    const competition = await prisma.competition.findUnique({
      where: { id },
      include: {
        organization: {
          include: {
            admins: {
              where: { userId: session.userId },
            },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json(
        { error: "Competition not found" },
        { status: 404 }
      );
    }

    if (!hasOrgAdminAccess(competition.organization.admins)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // お知らせを作成
    const announcement = await prisma.competitionAnnouncement.create({
      data: {
        competitionId: id,
        title,
        content,
        publishedAt: isPublished ? new Date() : null,
      },
    });

    if (announcement.publishedAt) {
      await notifyCompetitionAnnouncementPublished({
        announcementId: announcement.id,
        competitionId: id,
        title: announcement.title,
        content: announcement.content,
      });
    }

    return NextResponse.json(announcement);
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/announcements/route.ts", error);
  }
}
