import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";
import { ensureCompetitionScheduleTabs } from "@/lib/ensureCompetitionScheduleTabs";

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
      !canManageCompetitionStartListSettings({
        orgAdminsForCurrentUser: competition.organization.admins,
        hasDayOpsUnlock,
      })
    ) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    await ensureCompetitionScheduleTabs(competitionId);

    const body = (await request.json().catch(() => ({}))) as { orderedTabIds?: unknown };
    const orderedTabIds = body.orderedTabIds;
    if (!Array.isArray(orderedTabIds) || orderedTabIds.some((x) => typeof x !== "string")) {
      return NextResponse.json({ message: "orderedTabIds は文字列 ID の配列にしてください" }, { status: 400 });
    }

    const existing = await prisma.competitionScheduleTab.findMany({
      where: { competitionId },
      select: { id: true },
    });
    const set = new Set(existing.map((t) => t.id));
    if (orderedTabIds.length !== set.size) {
      return NextResponse.json({ message: "タブ ID の件数が一致しません" }, { status: 400 });
    }
    for (const id of orderedTabIds) {
      if (!set.has(id)) {
        return NextResponse.json({ message: "存在しないタブ ID が含まれています" }, { status: 400 });
      }
    }

    await prisma.$transaction(
      orderedTabIds.map((tabId, index) =>
        prisma.competitionScheduleTab.update({
          where: { id: tabId },
          data: { displayOrder: index },
        })
      )
    );

    return NextResponse.json({ message: "タブの並びを更新しました" });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/schedule-tabs/reorder/route.ts", error);
  }
}
