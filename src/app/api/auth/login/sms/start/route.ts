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
import { smsLoginStartAllowed } from "@/lib/smsHoldPolicy";
import { isSupabaseSmsOtpChannelActive } from "@/lib/smsOtpSupabase";
import { ensureSupabasePhoneUser, sendSmsOtpViaSupabase } from "@/lib/supabase/otp";
import { getTrustedClientIp, isLoginIpBlocklisted } from "@/lib/clientIp";
import {
  tryConsumeRateSlot,
  throttleKeySmsStartIp,
  SMS_LOGIN_START_IP_MAX,
  SMS_LOGIN_START_IP_WINDOW_MS,
} from "@/lib/loginThrottle";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

const StartLoginSchema = z.object({
  phoneNumber: z.string().min(10),
  resend: z.boolean().optional(),
});

const RESEND_COOLDOWN = 60; // 60秒
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = StartLoginSchema.parse(body);

    if (!smsLoginStartAllowed()) {
      return NextResponse.json(
        {
          error:
            "現在、SMSによるログインは一時的にご利用いただけません。メールアドレスとパスワード、またはパスキーでログインしてください。",
          code: "SMS_HELD",
        },
        { status: 503 }
      );
    }

    const ip = getTrustedClientIp(req);
    if (isLoginIpBlocklisted(ip)) {
      return NextResponse.json(
        { error: "現在このネットワークからはログインできません" },
        { status: 403 }
      );
    }

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

    const skipIpSlot = ip === "127.0.0.1" || ip === "::1";
    if (!skipIpSlot) {
      const slot = await tryConsumeRateSlot(
        throttleKeySmsStartIp(ip),
        SMS_LOGIN_START_IP_MAX,
        SMS_LOGIN_START_IP_WINDOW_MS
      );
      if (!slot.allowed) {
        return NextResponse.json(
          {
            error:
              "短時間に SMS 送信が繰り返されました。しばらく時間をおいてから再度お試しください。",
          },
          {
            status: 429,
            headers: { "Retry-After": String(slot.retryAfterSec) },
          }
        );
      }
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

    // 5. OTP生成（現行の失敗回数管理との互換のため hash は維持）
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

    // 7. SMS送信（フラグON時はSupabase OTPへ切替。SKIP_SMS 時はアプリ内 OTP のみ）
    if (isSupabaseSmsOtpChannelActive()) {
      await ensureSupabasePhoneUser(phoneE164);
      await sendSmsOtpViaSupabase(phoneE164);
    } else {
      await sendOTPviaSMS(phoneE164, otp);
    }

    return NextResponse.json({
      sessionId: loginSession.id,
      message: "認証コードを送信しました",
    });

  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Alphanumeric Sender ID cannot be used as the 'From' number on trial accounts")
    ) {
      return NextResponse.json(
        {
          error:
            "Twilio trialアカウントでは英数字Sender IDを使用できません。Twilioの電話番号をFromに設定するか、trial解除後に再試行してください。",
        },
        { status: 503 }
      );
    }
    if (error instanceof Error && error.message.includes("Invalid 'To' Phone Number")) {
      return NextResponse.json(
        { error: "SMS送信先の電話番号が無効です。E.164形式で有効な実在番号をご確認ください。" },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message.toLowerCase().includes("unsupported phone provider")) {
      return NextResponse.json(
        { error: "SupabaseのSMSプロバイダ設定が未完了です。管理者にお問い合わせください。" },
        { status: 503 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error), { status: 400 });
    }

    return jsonInternalError500("POST api/auth/login/sms/start/route.ts", error);
  }
}
