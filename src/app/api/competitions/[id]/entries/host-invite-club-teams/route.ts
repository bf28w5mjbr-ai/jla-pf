import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  hostOrgAdminGateJsonError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  if (!session?.userId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const clubId = request.nextUrl.searchParams.get("clubId")?.trim() ?? "";
  if (!clubId) {
    return NextResponse.json({ error: "clubId を指定してください" }, { status: 400 });
  }

  try {
    await requireHostOrgAdminForCompetition(competitionId, session.userId);
  } catch (e) {
    const gated = hostOrgAdminGateJsonError(e);
    if (gated) {
      return NextResponse.json({ error: gated.error }, { status: gated.status });
    }
    throw e;
  }

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: {
      id: true,
      name: true,
      abbreviation: true,
      status: true,
    },
  });

  if (!club || club.status !== "APPROVED") {
    return NextResponse.json({ error: "クラブが見つかりません" }, { status: 404 });
  }

  const teamEntries = await prisma.teamEntry.findMany({
    where: {
      competitionId,
      clubId,
    },
    select: {
      eventId: true,
      teamName: true,
    },
    orderBy: [{ eventId: "asc" }, { teamName: "asc" }, { id: "asc" }],
  });

  const byEvent: Record<string, { count: number; teamNames: string[] }> = {};
  for (const row of teamEntries) {
    const cur = byEvent[row.eventId];
    if (cur) {
      cur.count += 1;
      cur.teamNames.push(row.teamName);
    } else {
      byEvent[row.eventId] = { count: 1, teamNames: [row.teamName] };
    }
  }

  return NextResponse.json({
    club: {
      id: club.id,
      name: club.name,
      abbreviation: club.abbreviation,
    },
    byEvent,
  });
}
