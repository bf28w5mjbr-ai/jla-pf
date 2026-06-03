import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import {
  generateNextRoundStartListFromOfficial,
  type GenerateNextRoundSlMode,
} from "@/lib/startListNextRoundFromOfficial";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  eventId: z.string().min(1),
  fromRound: z.enum(["HEAT", "SEMI"]),
  mode: z.enum(["create", "regenerate", "rescue"]),
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
    const { eventId, fromRound, mode } = parsed.data;

    const result = await generateNextRoundStartListFromOfficial({
      competitionId,
      eventId,
      fromRound,
      mode: mode as GenerateNextRoundSlMode,
      operatorUserId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: 409 });
    }

    void logAuditAction({
      action: "COMPETITION_NEXT_ROUND_SL_GENERATE",
      actorType: operatorUserId ? "USER" : "SYSTEM",
      actorKey: operatorUserId ? `user:${operatorUserId}` : "dayops:unlock",
      actorUserId: operatorUserId ?? undefined,
      targetType: "CompetitionStartListSnapshot",
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        fromRound,
        mode,
        toRound: result.toRound,
        participantCount: result.participantCount,
        heatCount: result.heatCount,
        fingerprint: result.fingerprint,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({
      ok: true,
      toRound: result.toRound,
      participantCount: result.participantCount,
      heatCount: result.heatCount,
      fingerprint: result.fingerprint,
    });
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
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/next-round-sl-generate/route.ts",
      error
    );
  }
}
