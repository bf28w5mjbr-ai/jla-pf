import { NextResponse } from "next/server";
import { buildAppleAppSiteAssociation } from "@/lib/mobileAppLinks";

export const runtime = "nodejs";

export async function GET() {
  const body = buildAppleAppSiteAssociation();
  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
