import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";
import { ensureCompetitionScheduleTabs } from "@/lib/ensureCompetitionScheduleTabs";

type RouteContext = { params: Promise<{ id: string; tabId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId, tabId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    const sessionUserId = session?.userId ?? null;
    const hasDayOpsUnlock = await verifyDayOpsUnlockFromRequest(request, competitionId);

    if (!sessionUserId && !hasDayOpsUnlock) {
      return NextResponse.json({ message: "認証または当日運用アクセスが必要です" }, { status: 401 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        organization: {
          include: {
            admins: {
              where: { userId: sessionUserId ?? "clinvalidnosessionuser0000" },
            },
          },
        },
      },
    });
    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }
    if (
      !canManageCompetitionStartListSettings({
        orgAdminsForCurrentUser: competition.organization.admins,
        hasDayOpsUnlock,
      })
    ) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    await ensureCompetitionScheduleTabs(competitionId);

    const tab = await prisma.competitionScheduleTab.findFirst({
      where: { id: tabId, competitionId },
    });
    if (!tab) {
      return NextResponse.json({ message: "タブが見つかりません" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { orderedEventIds?: unknown };
    const orderedEventIds = body.orderedEventIds;
    if (!Array.isArray(orderedEventIds) || orderedEventIds.some((x) => typeof x !== "string")) {
      return NextResponse.json({ message: "orderedEventIds は文字列 ID の配列にしてください" }, { status: 400 });
    }

    const inTab = await prisma.event.findMany({
      where: { competitionId, scheduleTabId: tabId },
      select: { id: true },
    });
    const set = new Set(inTab.map((e) => e.id));
    if (orderedEventIds.length !== set.size) {
      return NextResponse.json(
        { message: "このタブに属する種目 ID の件数と一致しません" },
        { status: 400 }
      );
    }
    for (const id of orderedEventIds) {
      if (!set.has(id)) {
        return NextResponse.json({ message: "別タブの種目 ID が含まれています" }, { status: 400 });
      }
    }

    await prisma.$transaction(
      orderedEventIds.map((eventId, index) =>
        prisma.event.update({
          where: { id: eventId },
          data: { scheduleTabSortOrder: index + 1 },
        })
      )
    );

    return NextResponse.json({ message: "種目の並びを更新しました" });
  } catch (error) {
    return jsonInternalError500(
      "PUT api/competitions/[id]/schedule-tabs/[tabId]/events/order/route.ts",
      error
    );
  }
}
