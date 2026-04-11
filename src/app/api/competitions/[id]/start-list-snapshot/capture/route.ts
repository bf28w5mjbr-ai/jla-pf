import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import { replaceCompetitionStartListSnapshot } from "@/lib/startListSnapshot";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    const sessionUserId = session?.userId ?? null;

    const { id: competitionId } = await context.params;
    const hasDayOpsUnlock = await verifyDayOpsUnlockFromRequest(request, competitionId);
    if (!sessionUserId && !hasDayOpsUnlock) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        organizationId: true,
        organization: {
          select: {
            admins: {
              where: { userId: sessionUserId ?? "clinvalidnosessionuser0000" },
              select: { role: true },
            },
          },
        },
      },
    });
    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    if (
      !canManageCompetitionStartListSettings({
        orgAdminsForCurrentUser: competition.organization.admins,
        hasDayOpsUnlock,
      })
    ) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const result = await replaceCompetitionStartListSnapshot({
      competitionId,
      createdByUserId: sessionUserId ?? undefined,
    });

    await logAuditAction({
      action: "COMPETITION_START_LIST_SNAPSHOT_CAPTURE",
      actorType: sessionUserId ? "USER" : "SYSTEM",
      actorKey: sessionUserId ? `user:${sessionUserId}` : "dayops:unlock",
      actorUserId: sessionUserId ?? undefined,
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
