import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canEditCompetitionPublishedSchedule } from "@/lib/competitionStartListAccess";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";
import { ensureCompetitionScheduleTabs } from "@/lib/ensureCompetitionScheduleTabs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { id: true },
    });
    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    await ensureCompetitionScheduleTabs(competitionId);

    const tabs = await prisma.competitionScheduleTab.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        name: true,
        displayOrder: true,
        _count: { select: { events: true } },
      },
    });

    return NextResponse.json({
      tabs: tabs.map((t) => ({
        id: t.id,
        name: t.name,
        displayOrder: t.displayOrder,
        eventCount: t._count.events,
      })),
    });
  } catch (error) {
    return jsonInternalError500("GET api/competitions/[id]/schedule-tabs/route.ts", error);
  }
}

async function loadCompetitionWithAdmins(competitionId: string, sessionUserId: string | null) {
  return prisma.competition.findUnique({
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
}

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

    const competition = await loadCompetitionWithAdmins(competitionId, sessionUserId);
    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    if (
      !canEditCompetitionPublishedSchedule({
        orgAdminsForCurrentUser: competition.organization.admins,
      })
    ) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    await ensureCompetitionScheduleTabs(competitionId);

    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ message: "タブ名を入力してください" }, { status: 400 });
    }
    const name = body.name.trim().slice(0, 64);

    const agg = await prisma.competitionScheduleTab.aggregate({
      where: { competitionId },
      _max: { displayOrder: true },
    });
    const nextOrder = (agg._max.displayOrder ?? -1) + 1;

    const tab = await prisma.competitionScheduleTab.create({
      data: {
        competitionId,
        name,
        displayOrder: nextOrder,
      },
      select: { id: true, name: true, displayOrder: true },
    });

    return NextResponse.json({ message: "タブを追加しました", tab });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/schedule-tabs/route.ts", error);
  }
}
