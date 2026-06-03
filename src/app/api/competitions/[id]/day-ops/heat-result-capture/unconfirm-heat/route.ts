import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

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

    const result = await prisma.$transaction(async (tx) => {
      const official = await tx.officialResult.findUnique({
        where: {
          competitionId_eventId_round: { competitionId, eventId, round },
        },
        select: { id: true, lockedAt: true },
      });
      if (!official) {
        throw new Error("OFFICIAL_RESULT_NOT_FOUND");
      }
      if (official.lockedAt) {
        throw new Error("OFFICIAL_RESULT_LOCKED");
      }

      const heatConfirmed = await tx.officialResultHeatConfirmed.findUnique({
        where: {
          officialResultId_heat: {
            officialResultId: official.id,
            heat: heatIndex,
          },
        },
        select: { id: true },
      });
      if (!heatConfirmed) {
        throw new Error("HEAT_RESULT_NOT_CONFIRMED");
      }

      await tx.officialResultHeatConfirmed.delete({
        where: { id: heatConfirmed.id },
      });

      return { officialResultId: official.id };
    });

    void logAuditAction({
      action: "COMPETITION_HEAT_RESULT_UNCONFIRM",
      actorType: operatorUserId ? "USER" : "SYSTEM",
      actorKey: operatorUserId ? `user:${operatorUserId}` : "dayops:unlock",
      actorUserId: operatorUserId ?? undefined,
      targetType: "OfficialResultHeatConfirmed",
      targetId: result.officialResultId,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        round,
        heatIndex,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({ ok: true, heatIndex });
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
        { error: "種目全体の公式結果が確定済みのため、ヒート単位の確定解除はできません" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "HEAT_RESULT_NOT_CONFIRMED") {
      return NextResponse.json(
        { error: "このヒートはリザルト確定済みではありません" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "OFFICIAL_RESULT_NOT_FOUND") {
      return NextResponse.json({ error: "公式結果がありません" }, { status: 404 });
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/heat-result-capture/unconfirm-heat/route.ts",
      error
    );
  }
}
