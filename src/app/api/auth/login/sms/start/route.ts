// POST /api/auth/login/sms/start
// SMS OTPログイン: メール・氏名でユーザーを特定 → 登録電話へ OTP 送信
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { isValidJapaneseMobile, phoneToE164Loose } from "@/lib/phone";
import {
  generateOTP,
  hashOTP,
  getOTPExpiry,
  canResend,
  getResendCooldown,
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
import { LoginSessionPurpose } from "@prisma/client";

const RESEND_COOLDOWN = 60; // 60秒

const CREDENTIALS_ERROR =
  "メールアドレスまたはお名前が登録情報と一致しません。ご確認のうえ再度お試しください。";

const StartLoginSchema = z
  .object({
    email: z.string().email().optional(),
    familyName: z.string().min(1).optional(),
    givenName: z.string().min(1).optional(),
    resend: z.boolean().optional(),
    sessionId: z.string().cuid().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.resend && val.sessionId) return;
    if (!val.email?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "メールアドレスを入力してください",
        path: ["email"],
      });
    }
    if (!val.familyName?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "姓を入力してください",
        path: ["familyName"],
      });
    }
    if (!val.givenName?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "名を入力してください",
        path: ["givenName"],
      });
    }
  });

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
            retryAfterSec: slot.retryAfterSec,
          },
          {
            status: 429,
            headers: { "Retry-After": String(slot.retryAfterSec) },
          }
        );
      }
    }

    if (data.resend && data.sessionId) {
      const loginSession = await prisma.loginSession.findFirst({
        where: {
          id: data.sessionId,
          purpose: LoginSessionPurpose.SMS_LOGIN,
        },
        include: { user: { include: { contact: true } } },
      });

      if (!loginSession) {
        return NextResponse.json(
          { error: "セッションが見つかりません。最初からやり直してください。" },
          { status: 404 }
        );
      }

      if (!canResend(loginSession.lastSentAt, RESEND_COOLDOWN)) {
        const cooldown = getResendCooldown(loginSession.lastSentAt, RESEND_COOLDOWN);
        return NextResponse.json(
          {
            error: `再送信は${cooldown}秒後に可能です`,
            cooldown,
          },
          { status: 429 }
        );
      }

      const user = loginSession.user;
      if (user.deletedAt) {
        return NextResponse.json({ error: CREDENTIALS_ERROR }, { status: 404 });
      }

      const phoneE164 = phoneToE164Loose(user.contact?.phoneNumber ?? "");
      if (!isValidJapaneseMobile(phoneE164)) {
        return NextResponse.json(
          {
            error:
              "登録されている電話番号がSMS認証に利用できません。プロフィールで携帯番号をご確認ください。",
          },
          { status: 400 }
        );
      }

      const otp = generateOTP();
      const otpHash = await hashOTP(otp);
      const otpExpiresAt = getOTPExpiry();
      const now = new Date();

      const resendSessionId = loginSession.id;
      await prisma.loginSession.update({
        where: { id: resendSessionId },
        data: {
          phoneNumber: phoneE164,
          otpHash,
          otpExpiresAt,
          otpAttempts: 0,
          lastSentAt: now,
        },
      });

      if (isSupabaseSmsOtpChannelActive()) {
        await ensureSupabasePhoneUser(phoneE164);
        await sendSmsOtpViaSupabase(phoneE164);
      } else {
        await sendOTPviaSMS(phoneE164, otp);
      }

      if (user.contact?.phoneNumber !== phoneE164) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            contact: {
              upsert: {
                create: { phoneNumber: phoneE164 },
                update: { phoneNumber: phoneE164 },
              },
            },
          },
        });
      }

      return NextResponse.json({
        sessionId: resendSessionId,
        message: "認証コードを再送信しました",
      });
    }

    const normalizedEmail = data.email!.trim().toLowerCase();
    const familyName = data.familyName!.trim();
    const givenName = data.givenName!.trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true, contact: true },
    });

    if (!user || user.deletedAt) {
      return NextResponse.json({ error: CREDENTIALS_ERROR }, { status: 404 });
    }

    if (user.profile?.familyName.trim() !== familyName || user.profile?.givenName.trim() !== givenName) {
      return NextResponse.json({ error: CREDENTIALS_ERROR }, { status: 404 });
    }

    const phoneE164 = phoneToE164Loose(user.contact?.phoneNumber ?? "");
    if (!isValidJapaneseMobile(phoneE164)) {
      return NextResponse.json(
        {
          error:
            "登録されている電話番号がSMS認証に利用できません。プロフィールで携帯番号をご確認ください。",
        },
        { status: 400 }
      );
    }

    let loginSession = await prisma.loginSession.findUnique({
      where: {
        userId_purpose: {
          userId: user.id,
          purpose: LoginSessionPurpose.SMS_LOGIN,
        },
      },
    });

    if (loginSession && !canResend(loginSession.lastSentAt, RESEND_COOLDOWN)) {
      const cooldown = getResendCooldown(loginSession.lastSentAt, RESEND_COOLDOWN);
      return NextResponse.json(
        {
          error: `再送信は${cooldown}秒後に可能です`,
          cooldown,
        },
        { status: 429 }
      );
    }

    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    const otpExpiresAt = getOTPExpiry();
    const now = new Date();

    if (loginSession) {
      loginSession = await prisma.loginSession.update({
        where: { id: loginSession.id },
        data: {
          phoneNumber: phoneE164,
          otpHash,
          otpExpiresAt,
          otpAttempts: 0,
          lastSentAt: now,
        },
      });
    } else {
      loginSession = await prisma.loginSession.create({
        data: {
          purpose: LoginSessionPurpose.SMS_LOGIN,
          userId: user.id,
          phoneNumber: phoneE164,
          otpHash,
          otpExpiresAt,
          lastSentAt: now,
        },
      });
    }

    if (isSupabaseSmsOtpChannelActive()) {
      await ensureSupabasePhoneUser(phoneE164);
      await sendSmsOtpViaSupabase(phoneE164);
    } else {
      await sendOTPviaSMS(phoneE164, otp);
    }

    if (user.contact?.phoneNumber !== phoneE164) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          contact: {
            upsert: {
              create: { phoneNumber: phoneE164 },
              update: { phoneNumber: phoneE164 },
            },
          },
        },
      });
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
