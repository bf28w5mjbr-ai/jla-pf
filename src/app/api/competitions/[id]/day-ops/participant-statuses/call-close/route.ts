import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { assertDayOpsAdminWriteAccess } from "@/lib/dayOpsAccess";
import { buildCallWindowSettingsUpdate } from "@/lib/dayOpsCallWindow";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

type RouteContext = { params: Promise<{ id: string }> };

const payloadSchema = z.object({
  eventId: z.string().min(1),
  isClosed: z.boolean(),
});

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const ctx = await assertDayOpsAdminWriteAccess(competitionId, request);
    const operatorUserId = ctx.operatorUserId;

    const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const { eventId, isClosed } = parsed.data;
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        startListSettings: true,
        events: {
          where: { id: eventId },
          select: { id: true, startListHeatPlanConfirmedAt: true },
        },
      },
    });
    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    const eventRow = competition.events[0];
    if (!eventRow) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }
    if (!eventRow.startListHeatPlanConfirmedAt) {
      return NextResponse.json(
        {
          error:
            "先にスタートリストでステップ1（ラウンド別ヒート数）を確定してください。確定後にマーシャル操作が可能になります。",
        },
        { status: 409 }
      );
    }

    const nextSettings = buildCallWindowSettingsUpdate({
      currentSettings: competition.startListSettings,
      eventId,
      isClosed,
    });

    await prisma.competition.update({
      where: { id: competitionId },
      data: { startListSettings: nextSettings },
    });

    await logAuditAction({
      action: isClosed ? "COMPETITION_CALL_WINDOW_CLOSE" : "COMPETITION_CALL_WINDOW_REOPEN",
      actorType: operatorUserId ? "USER" : "SYSTEM",
      actorKey: operatorUserId ? `user:${operatorUserId}` : "dayops:unlock",
      actorUserId: operatorUserId ?? undefined,
      targetType: "Competition",
      targetId: competitionId,
      targetKey: `competition:${competitionId}`,
      metadata: { competitionId, eventId, isClosed },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({ ok: true, eventId, isClosed });
  } catch (error) {
    if (error instanceof Error && error.message === "COMPETITION_NOT_FOUND") {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_FORBIDDEN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_UNAUTHORIZED") {
      return NextResponse.json(
        { error: "ログインするか、大会の当日運用暗号をスタートリスト画面で入力してください" },
        { status: 401 }
      );
    }
    return jsonInternalError500(
      "PUT api/competitions/[id]/day-ops/participant-statuses/call-close/route.ts",
      error
    );
  }
}
