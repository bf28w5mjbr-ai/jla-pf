// POST /api/user/phone-change/start
// 電話番号変更のOTP送信
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hashOTP } from "@/lib/otp";
import { sendOTPviaSMS } from "@/lib/sns";
import { isSmsOutboundHeld } from "@/lib/smsHoldPolicy";
import { normalizePhone } from "@/lib/normalize-kana";
import { toE164 } from "@/lib/phone";
import { findUserByPhoneCandidates } from "@/lib/user-uniqueness";
import { jsonInternalError500 } from "@/lib/apiInternalError";

const PhoneChangeStartSchema = z.object({
  phone: z.string().regex(/^0\d{9,10}$/),
});

export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const sess = await verifySession(token);
    if (!sess?.userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const data = PhoneChangeStartSchema.parse(body);

    if (isSmsOutboundHeld()) {
      return NextResponse.json(
        {
          error:
            "SMS送信を保留しているため、電話番号の変更は完了できません。SMSが再開されてから再度お試しください。",
        },
        { status: 503 }
      );
    }

    // 電話番号の重複チェック
    const existingUser = await findUserByPhoneCandidates([
      data.phone,
      normalizePhone(data.phone),
      toE164(data.phone) ?? "",
    ]);

    if (existingUser && existingUser.id !== sess.userId) {
      return NextResponse.json(
        { error: "この電話番号は既に使用されています" },
        { status: 400 }
      );
    }

    // セキュリティ設定の確認
    const user = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { email: true, passwordHash: true },
    });

    const hasEmail = user?.email && !user.email.includes("@temp.jla.local");
    const hasPassword = !!user?.passwordHash;
    if (!hasEmail || !hasPassword) {
      return NextResponse.json(
        { error: "セキュリティ設定を完了してください" },
        { status: 403 }
      );
    }

    // 既存のセッションをクリーンアップ（60秒以上前のもの）
    await prisma.loginSession.deleteMany({
      where: {
        phoneNumber: data.phone,
        createdAt: { lt: new Date(Date.now() - 60_000) },
      },
    });

    // レート制限チェック（60秒以内の再送信を防ぐ）
    const recentSession = await prisma.loginSession.findFirst({
      where: {
        phoneNumber: data.phone,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    });

    if (recentSession) {
      return NextResponse.json(
        { error: "60秒以内に再送信はできません" },
        { status: 429 }
      );
    }

    // OTP生成
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await hashOTP(otp);

    // セッション作成
    await prisma.loginSession.create({
      data: {
        phoneNumber: data.phone,
        otpHash,
        otpAttempts: 0,
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5分
      },
    });

    // SMS送信
    await sendOTPviaSMS(data.phone, otp);

    return NextResponse.json({
      ok: true,
      message: "確認コードを送信しました",
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "電話番号の形式が正しくありません" },
        { status: 400 }
      );
    }

    return jsonInternalError500("POST api/user/phone-change/start/route.ts", error);
  }
}
