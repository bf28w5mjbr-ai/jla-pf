import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import {
  approveMembership,
  membershipServiceErrorStatus,
} from "@/lib/membershipService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string; membershipId: string }> }
) {
  try {
    const { clubId, membershipId } = await params;

    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const result = await approveMembership(membershipId, sess.userId, clubId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: membershipServiceErrorStatus(result.error) }
      );
    }

    return NextResponse.json({
      message: result.message,
      membership: result.membership,
    });
  } catch (error) {
    return jsonInternalError500(
      "POST api/clubs/[clubId]/members/[membershipId]/approve/route.ts",
      error
    );
  }
}
