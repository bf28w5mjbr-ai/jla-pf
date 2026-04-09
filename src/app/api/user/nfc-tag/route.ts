import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";

const updateSchema = z.object({
  nfcTagId: z
    .string()
    .trim()
    .min(1, "NFCタグIDを入力してください")
    .max(128, "NFCタグIDは128文字以内で入力してください"),
});

function normalizeTag(value: string) {
  // iOS/Android/Reader機器で表記揺れしやすい区切り文字と大小文字を吸収する。
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s\-:]/g, "");
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { nfcTagId: true },
    });
    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ nfcTagId: user.nfcTagId ?? null });
  } catch (error) {
    return jsonInternalError500("GET api/user/nfc-tag/route.ts", error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "入力内容が不正です";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const nfcTagId = normalizeTag(parsed.data.nfcTagId);
    const existing = await prisma.user.findFirst({
      where: {
        nfcTagId,
        id: { not: session.userId },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "このNFCタグIDは既に別ユーザーに紐付いています" },
        { status: 409 }
      );
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { nfcTagId },
    });

    await logAuditAction({
      action: "USER_NFC_TAG_UPSERT",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      actorUserId: session.userId,
      targetType: "User",
      targetId: session.userId,
      targetKey: `user:${session.userId}`,
      metadata: {
        nfcTagId,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({ nfcTagId });
  } catch (error) {
    return jsonInternalError500("PUT api/user/nfc-tag/route.ts", error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { nfcTagId: null },
    });

    await logAuditAction({
      action: "USER_NFC_TAG_REMOVE",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      actorUserId: session.userId,
      targetType: "User",
      targetId: session.userId,
      targetKey: `user:${session.userId}`,
      metadata: {},
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonInternalError500("DELETE api/user/nfc-tag/route.ts", error);
  }
}
