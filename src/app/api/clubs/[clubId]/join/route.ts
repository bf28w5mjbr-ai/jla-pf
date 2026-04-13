import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { applyForMembership } from "@/lib/membershipService";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;

    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const result = await applyForMembership(session.userId, clubId);

    if (!result.success || !result.membership) {
      const msg = result.message ?? "参加に失敗しました";
      const code = result.error;
      if (code === "CLUB_NOT_FOUND") {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      if (code === "ALREADY_MEMBER") {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      if (code === "RATE_LIMIT_EXCEEDED" || code === "REJECTED_COOLDOWN") {
        return NextResponse.json({ error: msg }, { status: 429 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({
      message: result.message,
      membership: {
        id: result.membership.id,
        status: result.membership.status,
      },
    });
  } catch (error) {
    return jsonInternalError500("POST api/clubs/[clubId]/join/route.ts", error);
  }
}
