import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifySession } from "@/lib/auth";
import { notificationUnreadCountTag } from "@/lib/cacheTags";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    const token = request.cookies.get("session")?.value ?? null;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { notificationId } = await params;
    const body = (await request.json().catch(() => ({}))) as { read?: unknown };
    const read = typeof body.read === "boolean" ? body.read : true;

    const updated = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId: session.userId,
      },
      data: { read },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    revalidateTag(notificationUnreadCountTag(session.userId), "max");

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonInternalError500("PATCH api/user/notifications/[notificationId]/route.ts", error);
  }
}
