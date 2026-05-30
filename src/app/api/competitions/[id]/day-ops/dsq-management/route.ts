import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { assertDayOpsReadAccess } from "@/lib/dayOpsAccess";
import {
  loadDsqManagementData,
  parseDsqManagementRoundParam,
} from "@/lib/dsqManagementLoad";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    await assertDayOpsReadAccess(competitionId, request);

    const sp = new URL(request.url).searchParams;
    const eventId = sp.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventIdが必要です" }, { status: 400 });
    }

    const round = parseDsqManagementRoundParam(sp.get("round"), "HEAT");
    if (!round) {
      return NextResponse.json({ error: "roundが不正です" }, { status: 400 });
    }

    const data = await loadDsqManagementData(competitionId, eventId, round);
    if (!data) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }

    return NextResponse.json(data);
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
    return jsonInternalError500(error);
  }
}
