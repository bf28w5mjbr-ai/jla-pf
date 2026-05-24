import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canEditCompetitionPublishedSchedule } from "@/lib/competitionStartListAccess";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";
import { ensureCompetitionScheduleTabs } from "@/lib/ensureCompetitionScheduleTabs";
import {
  moveRowKeyInDayAreaPartition,
  parseScheduleRowKey,
  partitionByDayToByTab,
} from "@/lib/scheduleRowOrder";
import {
  loadScheduleRowPartitionForCompetition,
  persistScheduleDayAreaPartition,
} from "@/lib/scheduleRowOrderServer";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
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
      rowKey?: unknown;
      toTabId?: unknown;
      toDayKey?: unknown;
      insertIndex?: unknown;
    };

    const rowKey = typeof body.rowKey === "string" ? body.rowKey.trim() : "";
    const toTabId = typeof body.toTabId === "string" ? body.toTabId.trim() : "";
    const toDayKey = typeof body.toDayKey === "string" ? body.toDayKey.trim() : "";
    if (!rowKey || !parseScheduleRowKey(rowKey)) {
      return NextResponse.json({ message: "rowKey が不正です" }, { status: 400 });
    }
    if (!toTabId) {
      return NextResponse.json({ message: "toTabId を指定してください" }, { status: 400 });
    }
    if (!toDayKey) {
      return NextResponse.json({ message: "toDayKey を指定してください" }, { status: 400 });
    }

    let insertIndex: number | undefined;
    if (body.insertIndex !== undefined && body.insertIndex !== null) {
      if (typeof body.insertIndex !== "number" || !Number.isInteger(body.insertIndex) || body.insertIndex < 0) {
        return NextResponse.json({ message: "insertIndex は 0 以上の整数にしてください" }, { status: 400 });
      }
      insertIndex = body.insertIndex;
    }

    const tab = await prisma.competitionScheduleTab.findFirst({
      where: { id: toTabId, competitionId },
    });
    if (!tab) {
      return NextResponse.json({ message: "移動先タブが見つかりません" }, { status: 404 });
    }

    const { events, partitionByDay, tabs, competitionDayKeys } =
      await loadScheduleRowPartitionForCompetition(competitionId);
    const tabIds = tabs.map((t) => t.id);
    const next = moveRowKeyInDayAreaPartition(
      partitionByDay,
      rowKey,
      toDayKey,
      toTabId,
      tabIds,
      insertIndex
    );
    if (!next) {
      return NextResponse.json({ message: "行の移動に失敗しました" }, { status: 400 });
    }

    await persistScheduleDayAreaPartition(
      next,
      tabIds,
      events,
      competitionDayKeys
    );

    const byTab = partitionByDayToByTab(next, tabIds);
    return NextResponse.json({
      message: "行のエリアを変更しました",
      tabs: Object.entries(byTab).map(([id, scheduleRowOrder]) => ({ id, scheduleRowOrder })),
    });
  } catch (error) {
    return jsonInternalError500(
      "POST api/competitions/[id]/schedule-tabs/rows/move/route.ts",
      error
    );
  }
}
