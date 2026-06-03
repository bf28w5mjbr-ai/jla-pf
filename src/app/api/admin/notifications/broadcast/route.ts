export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { requirePfAdmin } from "@/lib/accessControl";
import { createBroadcastNotifications } from "@/lib/notificationService";
import { prisma } from "@/server/db";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { resolveBroadcastTargetUserIds } from "@/lib/adminNotificationBroadcastTargets";

const BROADCAST_ROLES = ["USER", "ORG_ADMIN", "PF_ADMIN", "CLUB_ADMIN"] as const;

const BroadcastSchema = z.object({
  target: z.enum(["ALL", "ROLE"]),
  role: z.enum(BROADCAST_ROLES).optional(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  linkUrl: z.string().url().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    try {
      await requirePfAdmin(session.userId);
    } catch {
      return NextResponse.json(
        { error: "プラットフォーム管理者権限が必要です" },
        { status: 403 }
      );
    }

    const data = BroadcastSchema.parse(await request.json().catch(() => ({})));
    if (data.target === "ROLE" && !data.role) {
      return NextResponse.json({ error: "role is required for ROLE target" }, { status: 400 });
    }

    const userIds = await resolveBroadcastTargetUserIds({
      target: data.target,
      role: data.role,
    });

    const job = await prisma.notificationJob.create({
      data: {
        createdById: session.userId,
        status: "PENDING",
        payload: {
          target: data.target,
          role: data.role ?? null,
          title: data.title,
          linkUrl: data.linkUrl ?? null,
        },
        totalCount: userIds.length,
      },
    });

    const { successCount, failureCount } = await createBroadcastNotifications({
      userIds,
      category: "SYSTEM",
      type: "ADMIN_BROADCAST",
      title: data.title,
      body: data.body,
      relatedId: job.id,
      linkUrl: data.linkUrl,
    });

    await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: failureCount > 0 ? "FAILED" : "SENT",
        successCount,
        failureCount,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: session.userId,
        action: "ADMIN_NOTIFICATION_BROADCAST",
        target: "notifications",
        meta: {
          notificationJobId: job.id,
          target: data.target,
          role: data.role ?? null,
          title: data.title,
          totalCount: userIds.length,
          successCount,
          failureCount,
        },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        notificationJobId: job.id,
        totalCount: userIds.length,
        successCount,
        failureCount,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error), { status: 400 });
    }
    return jsonInternalError500("POST api/admin/notifications/broadcast/route.ts", error);
  }
}
