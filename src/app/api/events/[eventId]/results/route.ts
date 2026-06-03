import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isPfOrAccAdmin } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requireOrgAdmin } from "@/lib/accessControl";
import { mergeOfficialResultVisibilityFilter } from "@/lib/officialResultPublicVisibility";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { competitionId: true, competition: { select: { organizationId: true } } },
    });

    if (!event) {
      return NextResponse.json({ error: "イベントが見つかりません" }, { status: 404 });
    }

    let canViewUnpublished = false;
    if (session?.userId) {
      if (await isPfOrAccAdmin(session.userId)) {
        canViewUnpublished = true;
      } else {
        try {
          await requireOrgAdmin(event.competition.organizationId, session.userId, "operational");
          canViewUnpublished = true;
        } catch {
          canViewUnpublished = false;
        }
      }
    }

    const results = await prisma.officialResult.findMany({
      where: mergeOfficialResultVisibilityFilter(
        { competitionId: event.competitionId, eventId },
        canViewUnpublished
      ),
      include: { rows: { orderBy: [{ heat: "asc" }, { rank: "asc" }] } },
      orderBy: { round: "asc" },
    });

    return NextResponse.json({ results });
  } catch (error) {
    return jsonInternalError500("GET api/events/[eventId]/results/route.ts", error);
  }
}

export async function POST() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
