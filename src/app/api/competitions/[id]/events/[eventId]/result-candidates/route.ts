import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id: competitionId, eventId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { organizationId: true },
    });
    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    try {
      await requireOrgAdmin(competition.organizationId, session.userId, "operational");
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const [individualCandidates, teamCandidates] = await Promise.all([
      prisma.competitionEntry.findMany({
        where: {
          competitionId,
          status: "SUBMITTED",
          items: {
            some: { eventId },
          },
        },
        select: {
          id: true,
          user: {
            select: {
              profile: { select: { familyName: true, givenName: true } },
            },
          },
          club: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.teamEntry.findMany({
        where: {
          competitionId,
          eventId,
        },
        select: {
          id: true,
          teamName: true,
          club: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return NextResponse.json({
      individualCandidates: individualCandidates.map((entry) => ({
        id: entry.id,
        label: `${`${entry.user.profile?.familyName ?? ""} ${entry.user.profile?.givenName ?? ""}`.trim()}${
          entry.club?.name ? `（${entry.club.name}）` : ""
        }`,
      })),
      teamCandidates: teamCandidates.map((entry) => ({
        id: entry.id,
        label: `${entry.teamName}${entry.club?.name ? `（${entry.club.name}）` : ""}`,
      })),
    });
  } catch (error) {
    return jsonInternalError500("GET api/competitions/[id]/events/[eventId]/result-candidates/route.ts", error);
  }
}
