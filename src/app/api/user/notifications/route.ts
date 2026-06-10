import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifySession } from "@/lib/auth";
import { notificationUnreadCountTag } from "@/lib/cacheTags";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";

function parseLimit(raw: string | null): number {
  const value = Number(raw ?? 20);
  if (!Number.isFinite(value)) return 20;
  return Math.min(Math.max(Math.floor(value), 1), 100);
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value ?? null;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: { userId: session.userId, read: false },
      }),
    ]);

    return NextResponse.json({ items, unreadCount });
  } catch (error) {
    return jsonInternalError500("GET api/user/notifications/route.ts", error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value ?? null;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      mode?: unknown;
      ids?: unknown;
      read?: unknown;
    };
    const markRead = typeof body.read === "boolean" ? body.read : true;

    if (body.mode === "all") {
      const result = await prisma.notification.updateMany({
        where: { userId: session.userId },
        data: { read: markRead },
      });
      if (result.count > 0) {
        revalidateTag(notificationUnreadCountTag(session.userId), "max");
      }
      return NextResponse.json({ updatedCount: result.count });
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "ids is required" }, { status: 400 });
    }

    const result = await prisma.notification.updateMany({
      where: {
        userId: session.userId,
        id: { in: ids },
      },
      data: { read: markRead },
    });

    if (result.count > 0) {
      revalidateTag(notificationUnreadCountTag(session.userId), "max");
    }

    return NextResponse.json({ updatedCount: result.count });
  } catch (error) {
    return jsonInternalError500("PATCH api/user/notifications/route.ts", error);
  }
}
