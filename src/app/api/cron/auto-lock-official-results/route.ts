import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { runAutoLockOfficialResultsPass } from "@/lib/officialResultAutoLock";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ message: "CRON_SECRET が未設定です" }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
  }

  try {
    const result = await runAutoLockOfficialResultsPass(prisma);
    return NextResponse.json({
      message: "公式結果の自動ロックを完了しました",
      ...result,
    });
  } catch (e) {
    return jsonInternalError500("GET api/cron/auto-lock-official-results/route.ts", e);
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
