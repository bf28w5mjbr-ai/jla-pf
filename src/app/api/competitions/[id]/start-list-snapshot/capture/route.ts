import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import { replaceCompetitionStartListSnapshot } from "@/lib/startListSnapshot";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: competitionId } = await context.params;
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        organizationId: true,
        organization: {
          select: {
            admins: {
              where: { userId: session.userId },
              select: { role: true },
            },
          },
        },
        officialApplications: {
          where: { userId: session.userId },
          select: { status: true },
          take: 1,
        },
        officialAttendances: {
          where: { userId: session.userId },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    if (
      !canManageCompetitionStartListSettings({
        orgAdminsForCurrentUser: competition.organization.admins,
        officialApplicationStatus: competition.officialApplications[0]?.status ?? null,
        hasOfficialAttendance: competition.officialAttendances.length > 0,
      })
    ) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const result = await replaceCompetitionStartListSnapshot({
      competitionId,
      createdByUserId: session.userId,
    });

    await logAuditAction({
      action: "COMPETITION_START_LIST_SNAPSHOT_CAPTURE",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      actorUserId: session.userId,
      targetType: "CompetitionStartListSnapshot",
      targetId: result.snapshotId,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        wasUpdate: result.wasUpdate,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({
      ok: true,
      snapshotId: result.snapshotId,
      wasUpdate: result.wasUpdate,
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/start-list-snapshot/capture/route.ts", error);
  }
}
