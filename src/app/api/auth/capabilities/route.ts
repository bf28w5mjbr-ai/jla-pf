// GET /api/auth/capabilities — クライアント向け認証まわりの公開フラグ（秘密は含めない）
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAuthPublicFlags } from "@/lib/smsHoldPolicy";

export async function GET() {
  return NextResponse.json(getAuthPublicFlags(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
