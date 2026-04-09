import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";

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

    const { title, content } = await request.json();

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
        publishedAt: new Date(), // 即座に公開
      },
    });

    return NextResponse.json(announcement);
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/announcements/route.ts", error);
  }
}
