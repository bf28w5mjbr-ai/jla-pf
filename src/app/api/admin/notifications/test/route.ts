export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { requirePfAdmin } from "@/lib/accessControl";
import { createNotification } from "@/lib/notificationService";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { jsonInternalError500 } from "@/lib/apiInternalError";

const TestNotificationSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  linkUrl: z.string().url().optional(),
});

// POST /api/admin/notifications/test
// PF_ADMINのみ: 指定ユーザーへテスト通知（DB通知 + Push送信）を実行
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

    const body = await request.json().catch(() => ({}));
    const data = TestNotificationSchema.parse(body);

    const notification = await createNotification({
      userId: data.userId,
      category: "SYSTEM",
      type: "MANUAL_TEST_PUSH",
      title: data.title,
      body: data.body,
      linkUrl: data.linkUrl,
    });

    return NextResponse.json({ ok: true, notification }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error), { status: 400 });
    }

    return jsonInternalError500("POST api/admin/notifications/test/route.ts", error);
  }
}
