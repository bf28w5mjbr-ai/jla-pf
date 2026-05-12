import { NextRequest, NextResponse } from "next/server";
import { safeServerErrorLog } from "@/lib/safeServerLog";
import { runScheduledStartListSnapshotPass } from "@/lib/startListSnapshot";

export const dynamic = "force-dynamic";

/** 多数大会を連続処理するため余裕を持たせる（Vercel Pro 想定。未設定時はプラットフォーム既定） */
export const maxDuration = 60;

function authorizeCron(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * 互換のため残す。初回 HEAT の自動作成は廃止したため、認証済みでは常に no-op（JSON に `disabledReason` を付与）。
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    if (process.env.NODE_ENV === "production" && !process.env.CRON_SECRET) {
      safeServerErrorLog(
        "GET api/cron/ensure-start-list-snapshots/route.ts",
        new Error("CRON_SECRET not set in production")
      );
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runScheduledStartListSnapshotPass();
  return NextResponse.json({
    ok: true,
    disabledReason: "initial_heat_snapshot_requires_manual_capture",
    ...result,
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
