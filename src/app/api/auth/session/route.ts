export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";

/** クライアントがログイン状態を軽く確認する用（招待ページの導線など） */
export async function GET() {
  const jar = await cookies();
  const token = jar.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  return NextResponse.json({
    authenticated: Boolean(session?.userId),
    userId: session?.userId ?? null,
  });
}
