import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isPfOrAccAdmin } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requireOrgAdmin } from "@/lib/accessControl";
import { buildResultRoundLabelMap, type ResultRoundUiKey } from "@/lib/resultRoundLabels";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { organizationId: true, startListSettings: true },
    });

    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    let canViewUnpublished = false;
    if (session?.userId) {
      if (await isPfOrAccAdmin(session.userId)) {
        canViewUnpublished = true;
      } else {
        try {
          await requireOrgAdmin(competition.organizationId, session.userId);
          canViewUnpublished = true;
        } catch {
          canViewUnpublished = false;
        }
      }
    }

    const results = await prisma.officialResult.findMany({
      where: {
        competitionId,
        ...(canViewUnpublished ? {} : { publishedAt: { not: null } }),
      },
      include: {
        event: { select: { id: true, name: true } },
        rows: true,
      },
      orderBy: [{ eventId: "asc" }, { round: "asc" }],
    });

    const eventIds = [...new Set(results.map((r) => r.eventId))];
    const eventRows =
      eventIds.length > 0
        ? await prisma.event.findMany({
            where: { id: { in: eventIds } },
            select: { id: true, startListRoundCount: true },
          })
        : [];
    const roundLabelsByEventId: Record<string, Partial<Record<ResultRoundUiKey, string>>> = {};
    for (const er of eventRows) {
      roundLabelsByEventId[er.id] = buildResultRoundLabelMap(
        competition.startListSettings,
        er.id,
        er.startListRoundCount
      );
    }

    return NextResponse.json({ results, roundLabelsByEventId });
  } catch (error) {
    return jsonInternalError500("GET api/competitions/[id]/results/route.ts", error);
  }
}