import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { computeDayOpsLiveFingerprint } from "@/lib/dayOpsLiveFingerprint";

type RouteContext = { params: Promise<{ id: string }> };

/** 当日運用データに変化があったかだけを軽量に返す（フル GET ポーリングの代替） */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    await assertDayOpsRecorderWriteAccess(competitionId, request);

    const eventId = request.nextUrl.searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventIdが必要です" }, { status: 400 });
    }

    const fingerprint = await computeDayOpsLiveFingerprint(competitionId, eventId);
    return NextResponse.json({ fingerprint });
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
      "GET api/competitions/[id]/day-ops/live-fingerprint/route.ts",
      error
    );
  }
}
