import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canEditCompetitionPublishedSchedule } from "@/lib/competitionStartListAccess";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
        events: { select: { id: true } },
      },
    });

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

    const body = (await request.json().catch(() => ({}))) as {
      orderedEventIds?: unknown;
    };
    const orderedEventIds = body.orderedEventIds;
    if (!Array.isArray(orderedEventIds) || orderedEventIds.some((x) => typeof x !== "string")) {
      return NextResponse.json({ message: "orderedEventIds が不正です" }, { status: 400 });
    }

    const validIds = new Set(competition.events.map((e) => e.id));
    if (orderedEventIds.length !== validIds.size) {
      return NextResponse.json({ message: "種目 ID の件数が一致しません" }, { status: 400 });
    }
    for (const id of orderedEventIds) {
      if (!validIds.has(id)) {
        return NextResponse.json({ message: "存在しない種目 ID が含まれています" }, { status: 400 });
      }
    }

    await prisma.$transaction(
      orderedEventIds.map((eventId, index) =>
        prisma.event.update({
          where: { id: eventId },
          data: { displayOrder: index + 1 },
        })
      )
    );

    return NextResponse.json({ message: "表示順を更新しました" });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/events/display-order/route.ts", error);
  }
}
