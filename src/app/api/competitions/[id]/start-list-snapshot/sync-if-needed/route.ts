import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { prisma } from "@/server/db";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";
import { syncStartListSnapshotBeforeMarshal } from "@/lib/startListSnapshotOnEntryIncrease";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    const sessionUserId = session?.userId ?? null;
    const hasDayOpsUnlock = await verifyDayOpsUnlockFromRequest(request, competitionId);

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        status: true,
        startListPubliclyVisible: true,
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

    const isOrgAdmin = hasOrgAdminAccess(competition.organization.admins);
    if (competition.status === "DRAFT" && !isOrgAdmin) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    const canViewStartList =
      (competition.startListPubliclyVisible ?? true) || isOrgAdmin || hasDayOpsUnlock;
    if (!canViewStartList) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const events = await prisma.event.findMany({
      where: { competitionId },
      select: { id: true },
    });

    const result = await syncStartListSnapshotBeforeMarshal({
      competitionId,
      candidateEventIds: events.map((e) => e.id),
      createdByUserId: sessionUserId ?? undefined,
      trigger: "PERIODIC_POLL",
      request,
    });

    return NextResponse.json({
      ok: true,
      refreshedEventIds: result.refreshedEventIds,
      skippedReason: result.skippedReason,
    });
  } catch (error) {
    return jsonInternalError500(
      "POST api/competitions/[id]/start-list-snapshot/sync-if-needed/route.ts",
      error
    );
  }
}
