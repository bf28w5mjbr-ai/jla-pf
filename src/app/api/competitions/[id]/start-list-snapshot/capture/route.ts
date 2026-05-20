import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import { replaceCompetitionStartListSnapshotWithAudit } from "@/lib/replaceStartListSnapshotWithAudit";
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
            status: true,
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
      !canManageCompetitionStartListSettings({ orgAdminsForCurrentUser: competition.organization.admins, orgStatus: competition.organization.status, hasDayOpsUnlock,
      })
    ) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const result = await replaceCompetitionStartListSnapshotWithAudit(request, {
      competitionId,
      sessionUserId,
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
