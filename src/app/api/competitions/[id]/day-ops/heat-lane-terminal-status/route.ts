import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { applyHeatLaneTerminalStatus } from "@/lib/heatLaneTerminalStatusApply";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";
import { START_LIST_STEP1_REQUIRED_SHORT_MESSAGE } from "@/lib/startListStep1Messages";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  eventId: z.string().min(1),
  round: z.enum(["HEAT", "SEMI", "FINAL"]),
  heatIndex: z.number().int().min(1),
  lane: z.number().int().min(1),
  status: z.enum(["DNS", "WITHDRAWN", "DSQ", "DNF"]),
  reason: z.string().trim().min(1).max(500).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const ctx = await assertDayOpsRecorderWriteAccess(competitionId, request);
    const operatorUserId = ctx.operatorUserId;

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const { eventId, round, heatIndex, lane, status: targetStatus } = parsed.data;
    const roundDb = round as ResultRound;

    const eventRow = await prisma.event.findFirst({
      where: { id: eventId, competitionId },
      select: { id: true, startListHeatPlanConfirmedAt: true },
    });
    if (!eventRow) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }
    if (!eventRow.startListHeatPlanConfirmedAt) {
      return NextResponse.json(
        { error: START_LIST_STEP1_REQUIRED_SHORT_MESSAGE },
        { status: 409 }
      );
    }

    const result = await applyHeatLaneTerminalStatus({
      competitionId,
      eventId,
      round: roundDb,
      heatIndex,
      lane,
      status: targetStatus,
      reason: parsed.data.reason,
      operatorUserId,
    });

    await logAuditAction({
      action: "COMPETITION_HEAT_LANE_TERMINAL_STATUS",
      actorType: operatorUserId ? "USER" : "SYSTEM",
      actorKey: operatorUserId ? `user:${operatorUserId}` : "dayops:unlock",
      actorUserId: operatorUserId ?? undefined,
      targetType: "CompetitionParticipantStatus",
      targetId: result.id,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        round,
        heatIndex,
        lane,
        status: targetStatus,
        alreadyApplied: result.alreadyApplied,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({
      ok: true,
      alreadyApplied: result.alreadyApplied,
      status: result.status,
      officialSyncSkipped: result.officialSyncSkipped,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DAY_OPS_FORBIDDEN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_UNAUTHORIZED") {
      return NextResponse.json(
        { error: "ログインするか、大会の当日運用暗号をスタートリスト画面で入力してください" },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message === "LANE_EMPTY") {
      return NextResponse.json(
        { error: "そのレーンに参加者がいません（スタートリストとレーン番号を確認してください）" },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message === "PARTICIPANT_TERMINAL_OTHER") {
      return NextResponse.json(
        { error: "別の終了ステータスが付いている参加者です。先に取り消してください。" },
        { status: 409 }
      );
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/heat-lane-terminal-status/route.ts",
      error
    );
  }
}
