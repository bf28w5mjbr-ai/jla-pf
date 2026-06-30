import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  hostOrgAdminGateJsonError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";
import { notifyCompetitionAnnouncementPublished } from "@/lib/announcementNotification";
import { revalidateCompetitionPublicPage } from "@/lib/revalidateCompetitionPublicPage";

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

    try {
      await requireHostOrgAdminForCompetition(id, session.userId);
    } catch (e) {
      const gated = hostOrgAdminGateJsonError(e);
      if (gated) {
        return NextResponse.json({ error: gated.error }, { status: gated.status });
      }
      throw e;
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

    revalidateCompetitionPublicPage(id);

    return NextResponse.json(announcement);
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/announcements/route.ts", error);
  }
}
