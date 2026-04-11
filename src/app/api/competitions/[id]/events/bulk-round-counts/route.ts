import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { syncStartListSettingsRoundTabsForEvents } from "@/lib/startListRoundCountSync";

/**
 * 種目表保存など: ラウンド数だけを複数行まとめて更新（startListSettings の競合を避ける）。
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await context.params;

    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      items?: unknown;
    } | null;
    const rawItems = body?.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ message: "items が必要です" }, { status: 400 });
    }

    const items: Array<{ eventId: string; startListRoundCount: number }> = [];
    const seenIds = new Set<string>();
    for (const row of rawItems) {
      if (!row || typeof row !== "object") {
        return NextResponse.json({ message: "items の形式が不正です" }, { status: 400 });
      }
      const r = row as Record<string, unknown>;
      const eventId = r.eventId;
      const rc = r.startListRoundCount;
      if (typeof eventId !== "string" || !eventId.trim()) {
        return NextResponse.json({ message: "eventId が必要です" }, { status: 400 });
      }
      if (seenIds.has(eventId)) {
        return NextResponse.json(
          { message: "同一の種目 ID が重複しています" },
          { status: 400 }
        );
      }
      seenIds.add(eventId);

      let nextRound: number;
      if (typeof rc === "number" && Number.isInteger(rc)) {
        nextRound = rc;
      } else if (typeof rc === "string" && /^\d+$/.test(rc.trim())) {
        nextRound = parseInt(rc.trim(), 10);
      } else {
        return NextResponse.json(
          { message: "スタートリストのラウンド数は1〜32の整数にしてください" },
          { status: 400 }
        );
      }
      if (nextRound < 1 || nextRound > 32) {
        return NextResponse.json(
          { message: "スタートリストのラウンド数は1〜32の範囲で指定してください" },
          { status: 400 }
        );
      }
      items.push({ eventId, startListRoundCount: nextRound });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        organization: {
          include: {
            admins: {
              where: { userId: session.userId },
            },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    if (!hasOrgAdminAccess(competition.organization.admins)) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    const events = await prisma.event.findMany({
      where: { id: { in: items.map((i) => i.eventId) } },
      select: { id: true, competitionId: true, marshalStartedAt: true },
    });
    if (events.length !== items.length) {
      return NextResponse.json({ message: "種目が見つかりません" }, { status: 404 });
    }
    for (const e of events) {
      if (e.competitionId !== competitionId) {
        return NextResponse.json({ message: "種目が見つかりません" }, { status: 404 });
      }
      if (e.marshalStartedAt) {
        return NextResponse.json(
          { message: "マーシャル開始後はスタートリストのラウンド数を変更できません" },
          { status: 409 }
        );
      }
    }

    await syncStartListSettingsRoundTabsForEvents({
      competitionId,
      items: items.map((i) => ({
        eventId: i.eventId,
        roundCount: i.startListRoundCount,
      })),
    });

    const updatedEvents = await prisma.event.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({
      message: "スタートリストのラウンド数を更新しました",
      events: updatedEvents,
    });
  } catch (error) {
    return jsonInternalError500(
      "POST api/competitions/[id]/events/bulk-round-counts/route.ts",
      error
    );
  }
}
