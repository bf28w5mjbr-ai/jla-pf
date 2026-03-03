// POST /api/auth/login/sms/start
// SMS OTPログイン: 電話番号入力 → OTP送信
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { isValidJapaneseMobile, toE164 } from "@/lib/phone";
import { normalizePhone } from "@/lib/normalize-kana";
import { 
  generateOTP, 
  hashOTP, 
  getOTPExpiry,
  canResend,
  getResendCooldown
} from "@/lib/otp";
import { sendOTPviaSMS } from "@/lib/sns";

const StartLoginSchema = z.object({
  phoneNumber: z.string().min(10),
  resend: z.boolean().optional(),
});

const RESEND_COOLDOWN = 60; // 60秒

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = StartLoginSchema.parse(body);

    // 1. 電話番号バリデーション
    if (!isValidJapaneseMobile(data.phoneNumber)) {
      return NextResponse.json(
        { error: "有効な日本国内の携帯電話番号を入力してください" },
        { status: 400 }
      );
    }

    const phoneE164 = toE164(data.phoneNumber);
    const localPhone = normalizePhone(data.phoneNumber);

    // 2. ユーザーの存在確認
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: phoneE164 },
          { phoneNumber: localPhone },
        ],
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "この電話番号は登録されていません。新規登録してください。" },
        { status: 404 }
      );
    }

    if (user.phoneNumber !== phoneE164) {
      await prisma.user.update({
        where: { id: user.id },
        data: { phoneNumber: phoneE164 },
      });
    }

    // 3. 既存のログインセッションチェック
    let loginSession = await prisma.loginSession.findUnique({
      where: { phoneNumber: phoneE164 },
    });

    // 4. 再送チェック
    if (loginSession && data.resend) {
      if (!canResend(loginSession.lastSentAt, RESEND_COOLDOWN)) {
        const cooldown = getResendCooldown(loginSession.lastSentAt, RESEND_COOLDOWN);
        return NextResponse.json(
          { 
            error: `再送信は${cooldown}秒後に可能です`,
            cooldown 
          },
          { status: 429 }
        );
      }
    }

    // 5. OTP生成
    const otp = generateOTP();
    const otpHash = await hashOTP(otp);

    // 6. LoginSession作成/更新
    const otpExpiresAt = getOTPExpiry();
    const now = new Date();

    if (loginSession) {
      loginSession = await prisma.loginSession.update({
        where: { phoneNumber: phoneE164 },
        data: {
          otpHash,
          otpExpiresAt,
          otpAttempts: 0,
          lastSentAt: now,
        },
      });
    } else {
      loginSession = await prisma.loginSession.create({
        data: {
          phoneNumber: phoneE164,
          otpHash,
          otpExpiresAt,
          lastSentAt: now,
        },
      });
    }

    // 7. SMS送信
    await sendOTPviaSMS(phoneE164, otp);

    return NextResponse.json({
      sessionId: loginSession.id,
      message: "認証コードを送信しました",
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "入力内容に誤りがあります", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Login start error:", error);
    return NextResponse.json(
      { error: "ログイン処理に失敗しました" },
      { status: 500 }
    );
  }
}
