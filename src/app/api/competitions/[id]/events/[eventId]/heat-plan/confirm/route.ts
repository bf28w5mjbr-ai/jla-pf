import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";

type RouteContext = { params: Promise<{ id: string; eventId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId, eventId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    const sessionUserId = session?.userId ?? null;
    const hasDayOpsUnlock = await verifyDayOpsUnlockFromRequest(request, competitionId);

    if (!sessionUserId && !hasDayOpsUnlock) {
      return NextResponse.json({ message: "認証または当日運用アクセスが必要です" }, { status: 401 });
    }

    const event = await prisma.event.findFirst({
      where: { id: eventId, competitionId },
      include: {
        competition: {
          include: {
            organization: {
              include: {
                admins: {
                  where: { userId: sessionUserId ?? "clinvalidnosessionuser0000" },
                },
              },
            },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ message: "種目が見つかりません" }, { status: 404 });
    }

    if (
      !canManageCompetitionStartListSettings({
        orgAdminsForCurrentUser: event.competition.organization.admins,
        hasDayOpsUnlock,
      })
    ) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    if (event.marshalStartedAt) {
      return NextResponse.json(
        { message: "マーシャル開始後はステップ1の状態を変更できません" },
        { status: 409 }
      );
    }

    if (event.startListHeatPlanConfirmedAt) {
      return NextResponse.json({
        message: "すでにステップ1は確定済みです",
        startListHeatPlanConfirmedAt: event.startListHeatPlanConfirmedAt.toISOString(),
      });
    }

    const now = new Date();
    await prisma.event.update({
      where: { id: eventId },
      data: { startListHeatPlanConfirmedAt: now },
    });

    return NextResponse.json({
      message: "ステップ1（ラウンド別ヒート数）を確定しました。当日運用のマーシャル操作が可能になります。",
      startListHeatPlanConfirmedAt: now.toISOString(),
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/events/[eventId]/heat-plan/confirm/route.ts", error);
  }
}
