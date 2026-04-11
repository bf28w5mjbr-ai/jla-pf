import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      mode: "live",
    },
    { status: 200 }
  );
}
