import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { evaluateNextRoundSlStatus } from "@/lib/startListNextRoundFromOfficial";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    await assertDayOpsRecorderWriteAccess(competitionId, request);

    const sp = new URL(request.url).searchParams;
    const eventId = sp.get("eventId");
    const fromRound = sp.get("fromRound");
    if (!eventId) {
      return NextResponse.json({ error: "eventIdが必要です" }, { status: 400 });
    }
    if (fromRound !== "HEAT" && fromRound !== "SEMI") {
      return NextResponse.json({ error: "fromRoundは HEAT または SEMI が必要です" }, { status: 400 });
    }

    const status = await evaluateNextRoundSlStatus({
      competitionId,
      eventId,
      fromRound,
    });
    if ("error" in status) {
      return NextResponse.json({ error: status.error }, { status: 400 });
    }

    return NextResponse.json(status);
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
      "GET api/competitions/[id]/day-ops/next-round-sl-status/route.ts",
      error
    );
  }
}
