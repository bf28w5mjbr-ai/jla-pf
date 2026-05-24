import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canEditCompetitionPublishedSchedule } from "@/lib/competitionStartListAccess";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";
import { parseScheduleRoundCountDraft } from "@/lib/competitionScheduleTabDisplay";
import { ensureCompetitionScheduleTabs } from "@/lib/ensureCompetitionScheduleTabs";
import {
  buildAllScheduleRowKeys,
  validateClientDayAreaPartition,
} from "@/lib/scheduleRowOrder";
import {
  loadPartitionSaveContextForCompetition,
  persistScheduleDayAreaPartition,
} from "@/lib/scheduleRowOrderServer";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
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
      !canEditCompetitionPublishedSchedule({
        orgAdminsForCurrentUser: competition.organization.admins,
        orgStatus: competition.organization.status,
      })
    ) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    await ensureCompetitionScheduleTabs(competitionId);

    const body = (await request.json().catch(() => ({}))) as {
      partitionByDay?: unknown;
    };

    const { events, tabs, competitionDayKeys } =
      await loadPartitionSaveContextForCompetition(competitionId);
    const tabIds = tabs.map((t) => t.id);
    const roundCountByEventId: Record<string, number> = {};
    for (const ev of events) {
      roundCountByEventId[ev.id] = parseScheduleRoundCountDraft(
        undefined,
        ev.startListRoundCount ?? 1
      );
    }
    const expectedKeys = buildAllScheduleRowKeys(events, roundCountByEventId);

    const validated = validateClientDayAreaPartition(body.partitionByDay, {
      tabIds,
      competitionDayKeys,
      expectedKeys,
    });
    if (!validated.ok) {
      return NextResponse.json({ message: validated.message }, { status: 400 });
    }

    const currentTabRowOrders: Record<string, unknown> = {};
    for (const tab of tabs) {
      currentTabRowOrders[tab.id] = tab.scheduleRowOrder;
    }

    await persistScheduleDayAreaPartition(
      validated.partition,
      tabIds,
      events,
      competitionDayKeys,
      {
        syncEventSortOrder: false,
        syncEventTabId: true,
        skipUnchangedTabs: true,
        currentTabRowOrders,
      }
    );

    return NextResponse.json({ message: "振分を保存しました" });
  } catch (error) {
    return jsonInternalError500(
      "PUT api/competitions/[id]/schedule-tabs/partition/route.ts",
      error
    );
  }
}
