import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import type { ResultRound } from "@prisma/client";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    await assertDayOpsRecorderWriteAccess(competitionId, session.userId);

    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId")?.trim() ?? "";
    const roundRaw = url.searchParams.get("round")?.trim().toUpperCase() ?? "";
    const round =
      roundRaw === "HEAT" || roundRaw === "SEMI" || roundRaw === "FINAL"
        ? (roundRaw as ResultRound)
        : null;
    if (!eventId || !round) {
      return NextResponse.json({ error: "eventId と round が必要です" }, { status: 400 });
    }

    const eventRow = await prisma.event.findFirst({
      where: { id: eventId, competitionId },
      select: { id: true },
    });
    if (!eventRow) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }

    const official = await prisma.officialResult.findUnique({
      where: {
        competitionId_eventId_round: { competitionId, eventId, round },
      },
      select: {
        lockedAt: true,
        heatConfirmations: { select: { heat: true } },
        rows: {
          where: { status: "OK" },
          select: {
            heat: true,
            lane: true,
            rank: true,
            entryType: true,
            competitionEntryId: true,
            teamEntryId: true,
          },
        },
      },
    });

    const rows =
      official?.rows?.map((r) => ({
        heat: r.heat,
        lane: r.lane,
        rank: r.rank,
        entryType: r.entryType,
        competitionEntryId: r.competitionEntryId,
        teamEntryId: r.teamEntryId,
      })) ?? [];

    const confirmedHeats =
      official?.heatConfirmations?.map((c) => c.heat).filter((h) => Number.isInteger(h)) ?? [];

    return NextResponse.json({
      lockedAt: official?.lockedAt?.toISOString() ?? null,
      confirmedHeats,
      rows,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DAY_OPS_FORBIDDEN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    return jsonInternalError500(
      "GET api/competitions/[id]/day-ops/heat-result-capture/route.ts",
      error
    );
  }
}
