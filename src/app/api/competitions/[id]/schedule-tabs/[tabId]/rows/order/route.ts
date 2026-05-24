import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canEditCompetitionPublishedSchedule } from "@/lib/competitionStartListAccess";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";
import { ensureCompetitionScheduleTabs } from "@/lib/ensureCompetitionScheduleTabs";
import { parseScheduleRowKey } from "@/lib/scheduleRowOrder";
import { persistTabRowOrderInPartition } from "@/lib/scheduleRowOrderServer";

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
      !canEditCompetitionPublishedSchedule({
        orgAdminsForCurrentUser: competition.organization.admins,
        orgStatus: competition.organization.status,
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

    const body = (await request.json().catch(() => ({}))) as {
      orderedRowKeys?: unknown;
      dayKey?: unknown;
    };
    const dayKey = typeof body.dayKey === "string" ? body.dayKey.trim() : "";
    if (!dayKey) {
      return NextResponse.json({ message: "dayKey を指定してください" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      return NextResponse.json({ message: "dayKey の形式が不正です" }, { status: 400 });
    }

    const orderedRowKeys = body.orderedRowKeys;
    if (!Array.isArray(orderedRowKeys) || orderedRowKeys.some((x) => typeof x !== "string")) {
      return NextResponse.json(
        { message: "orderedRowKeys は文字列キーの配列にしてください" },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    for (const key of orderedRowKeys) {
      if (!parseScheduleRowKey(key)) {
        return NextResponse.json({ message: `行キーの形式が不正です: ${key}` }, { status: 400 });
      }
      if (seen.has(key)) {
        return NextResponse.json({ message: "重複した行キーが含まれています" }, { status: 400 });
      }
      seen.add(key);
    }

    try {
      await persistTabRowOrderInPartition(competitionId, tabId, dayKey, orderedRowKeys);
    } catch (e) {
      if (e instanceof Error && e.message === "ROW_ORDER_MISMATCH") {
        return NextResponse.json(
          { message: "このタブ・日に属する行キーの集合と一致しません" },
          { status: 400 }
        );
      }
      throw e;
    }

    return NextResponse.json({ message: "タイムスケジュールの行順を更新しました" });
  } catch (error) {
    return jsonInternalError500(
      "PUT api/competitions/[id]/schedule-tabs/[tabId]/rows/order/route.ts",
      error
    );
  }
}
