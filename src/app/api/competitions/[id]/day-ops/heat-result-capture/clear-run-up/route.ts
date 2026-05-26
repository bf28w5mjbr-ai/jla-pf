import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";
import { START_LIST_STEP1_REQUIRED_SHORT_MESSAGE } from "@/lib/startListStep1Messages";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  eventId: z.string().min(1),
  round: z.enum(["HEAT", "SEMI", "FINAL"]),
  heatIndex: z.number().int().min(1),
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

    const { eventId, round, heatIndex } = parsed.data;
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

    const deletedCount = await prisma.$transaction(async (tx) => {
      const existing = await tx.officialResult.findUnique({
        where: {
          competitionId_eventId_round: { competitionId, eventId, round: roundDb },
        },
        select: { id: true, lockedAt: true },
      });
      if (existing?.lockedAt) {
        throw new Error("OFFICIAL_RESULT_LOCKED");
      }
      if (!existing) {
        return 0;
      }

      const heatConfirmedRow = await tx.officialResultHeatConfirmed.findUnique({
        where: {
          officialResultId_heat: {
            officialResultId: existing.id,
            heat: heatIndex,
          },
        },
        select: { id: true },
      });
      if (heatConfirmedRow) {
        throw new Error("HEAT_RESULT_CONFIRMED");
      }

      const res = await tx.officialResultRow.deleteMany({
        where: {
          officialResultId: existing.id,
          heat: heatIndex,
          status: "OK",
          advanceWithoutRank: true,
        },
      });
      return res.count;
    });

    await logAuditAction({
      action: "COMPETITION_HEAT_RESULT_CLEAR_RUN_UP",
      actorType: operatorUserId ? "USER" : "SYSTEM",
      actorKey: operatorUserId ? `user:${operatorUserId}` : "dayops:unlock",
      actorUserId: operatorUserId ?? undefined,
      targetType: "OfficialResult",
      targetId: eventId,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        round,
        heatIndex,
        deletedCount,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({ ok: true, deletedCount });
  } catch (error) {
    if (error instanceof Error && error.message === "DAY_OPS_FORBIDDEN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_UNAUTHORIZED") {
      return NextResponse.json(
        {
          error:
            "ログインするか、大会の当日運用暗号をスタートリスト画面で入力してください",
        },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message === "OFFICIAL_RESULT_LOCKED") {
      return NextResponse.json(
        { error: "種目全体の公式結果が確定済みのため、ランアップを解除できません" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "HEAT_RESULT_CONFIRMED") {
      return NextResponse.json(
        { error: "このヒートはリザルト確定済みのため、ランアップを解除できません" },
        { status: 409 }
      );
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/heat-result-capture/clear-run-up/route.ts",
      error
    );
  }
}
