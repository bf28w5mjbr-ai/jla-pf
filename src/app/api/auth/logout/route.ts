export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/issueSessionCookie";
import { jsonInternalError500 } from "@/lib/apiInternalError";

export async function POST() {
  try {
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonInternalError500("POST api/auth/logout/route.ts", error);
  }
}
