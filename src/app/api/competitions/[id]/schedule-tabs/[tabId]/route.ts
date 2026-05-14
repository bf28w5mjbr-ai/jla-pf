import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";
import { ensureCompetitionScheduleTabs } from "@/lib/ensureCompetitionScheduleTabs";

type RouteContext = { params: Promise<{ id: string; tabId: string }> };

async function assertEditor(
  request: NextRequest,
  competitionId: string,
  sessionUserId: string | null
) {
  const hasDayOpsUnlock = await verifyDayOpsUnlockFromRequest(request, competitionId);
  if (!sessionUserId && !hasDayOpsUnlock) {
    return { ok: false as const, status: 401, message: "認証または当日運用アクセスが必要です" };
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
    return { ok: false as const, status: 404, message: "大会が見つかりません" };
  }
  if (
    !canManageCompetitionStartListSettings({
      orgAdminsForCurrentUser: competition.organization.admins,
      hasDayOpsUnlock,
    })
  ) {
    return { ok: false as const, status: 403, message: "権限がありません" };
  }
  return { ok: true as const, competition };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId, tabId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    const sessionUserId = session?.userId ?? null;

    const gate = await assertEditor(request, competitionId, sessionUserId);
    if (!gate.ok) {
      return NextResponse.json({ message: gate.message }, { status: gate.status });
    }

    await ensureCompetitionScheduleTabs(competitionId);

    const tab = await prisma.competitionScheduleTab.findFirst({
      where: { id: tabId, competitionId },
    });
    if (!tab) {
      return NextResponse.json({ message: "タブが見つかりません" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ message: "タブ名を入力してください" }, { status: 400 });
    }
    const name = body.name.trim().slice(0, 64);

    await prisma.competitionScheduleTab.update({
      where: { id: tabId },
      data: { name },
    });

    return NextResponse.json({ message: "タブ名を更新しました" });
  } catch (error) {
    return jsonInternalError500("PATCH api/competitions/[id]/schedule-tabs/[tabId]/route.ts", error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId, tabId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    const sessionUserId = session?.userId ?? null;

    const gate = await assertEditor(request, competitionId, sessionUserId);
    if (!gate.ok) {
      return NextResponse.json({ message: gate.message }, { status: gate.status });
    }

    await ensureCompetitionScheduleTabs(competitionId);

    const tab = await prisma.competitionScheduleTab.findFirst({
      where: { id: tabId, competitionId },
      include: { _count: { select: { events: true } } },
    });
    if (!tab) {
      return NextResponse.json({ message: "タブが見つかりません" }, { status: 404 });
    }

    const url = new URL(request.url);
    const migrateToTabId = url.searchParams.get("migrateToTabId")?.trim() || "";

    const tabCount = await prisma.competitionScheduleTab.count({ where: { competitionId } });
    if (tabCount <= 1) {
      return NextResponse.json({ message: "最後の1つのタブは削除できません" }, { status: 400 });
    }

    if (tab._count.events > 0) {
      if (!migrateToTabId) {
        return NextResponse.json(
          { message: "このタブに種目があるため、削除前に migrateToTabId で移動先タブを指定してください" },
          { status: 400 }
        );
      }
      const target = await prisma.competitionScheduleTab.findFirst({
        where: { id: migrateToTabId, competitionId },
      });
      if (!target || target.id === tabId) {
        return NextResponse.json({ message: "移動先タブが無効です" }, { status: 400 });
      }
      const maxOrd = await prisma.event.aggregate({
        where: { competitionId, scheduleTabId: migrateToTabId },
        _max: { scheduleTabSortOrder: true },
      });
      let ord = (maxOrd._max.scheduleTabSortOrder ?? 0) + 1;
      const evs = await prisma.event.findMany({
        where: { competitionId, scheduleTabId: tabId },
        orderBy: [{ scheduleTabSortOrder: "asc" }, { displayOrder: "asc" }],
        select: { id: true },
      });
      for (const e of evs) {
        await prisma.event.update({
          where: { id: e.id },
          data: { scheduleTabId: migrateToTabId, scheduleTabSortOrder: ord },
        });
        ord += 1;
      }
    }

    await prisma.competitionScheduleTab.delete({ where: { id: tabId } });

    return NextResponse.json({ message: "タブを削除しました" });
  } catch (error) {
    return jsonInternalError500("DELETE api/competitions/[id]/schedule-tabs/[tabId]/route.ts", error);
  }
}
