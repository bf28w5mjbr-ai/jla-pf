// GET /api/auth/capabilities — クライアント向け認証まわりの公開フラグ（秘密は含めない）
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSmsAuthPublicFlags } from "@/lib/smsHoldPolicy";

export async function GET() {
  return NextResponse.json(
    getSmsAuthPublicFlags(),
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
