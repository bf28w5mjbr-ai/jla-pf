import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { syncTechnicalOfficialShortageNotificationsForUser } from "@/lib/technicalOfficialShortageNotification";
import { jsonInternalError500 } from "@/lib/apiInternalError";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value ?? null;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const result = await syncTechnicalOfficialShortageNotificationsForUser(session.userId);
    return NextResponse.json(result);
  } catch (error) {
    return jsonInternalError500("POST api/user/notifications/sync/route.ts", error);
  }
}
