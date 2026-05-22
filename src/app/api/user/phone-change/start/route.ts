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
import { zE164Mobile } from "@/lib/zodPhone";
import { isSmsOutboundHeld } from "@/lib/smsHoldPolicy";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { LoginSessionPurpose } from "@prisma/client";

const PhoneChangeStartSchema = z.object({
  phone: zE164Mobile(),
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

    // セキュリティ設定の確認
    const user = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { email: true, security: { select: { passwordHash: true } } },
    });

    const hasEmail = user?.email && !user.email.includes("@temp.jla.local");
    const hasPassword = !!user?.security?.passwordHash;
    if (!hasEmail || !hasPassword) {
      return NextResponse.json(
        { error: "セキュリティ設定を完了してください" },
        { status: 403 }
      );
    }

    await prisma.loginSession.deleteMany({
      where: {
        userId: sess.userId,
        purpose: LoginSessionPurpose.PHONE_CHANGE,
        createdAt: { lt: new Date(Date.now() - 60_000) },
      },
    });

    const recentSession = await prisma.loginSession.findFirst({
      where: {
        userId: sess.userId,
        purpose: LoginSessionPurpose.PHONE_CHANGE,
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
        purpose: LoginSessionPurpose.PHONE_CHANGE,
        userId: sess.userId,
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
