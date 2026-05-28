import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { processAllOverdueCampaignDeadlines } from "@/lib/entryPaymentIntent";
import { prisma } from "@/server/db";

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
    const result = await processAllOverdueCampaignDeadlines(prisma);
    return NextResponse.json({
      message: "期限切れ処理を完了しました",
      ...result,
    });
  } catch (e) {
    return jsonInternalError500("GET api/cron/unpaid-entry-intent-deadline/route.ts", e);
  }
}
