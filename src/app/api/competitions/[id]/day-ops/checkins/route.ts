import { NextResponse } from "next/server";

const CHECKIN_DISABLED_MESSAGE =
  "チェックイン運用は廃止されました。招集ステータス運用をご利用ください。";

export async function GET() {
  return NextResponse.json({ error: CHECKIN_DISABLED_MESSAGE }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: CHECKIN_DISABLED_MESSAGE }, { status: 410 });
}
