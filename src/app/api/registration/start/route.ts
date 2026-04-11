// POST /api/registration/start
// 基本情報入力 -> SMS OTP送信
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTrustedClientIp, isLoginIpBlocklisted } from "@/lib/clientIp";
import {
  tryConsumeRateSlot,
  throttleKeyRegistrationStartIp,
  REGISTRATION_START_IP_MAX,
  REGISTRATION_START_IP_WINDOW_MS,
} from "@/lib/loginThrottle";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { prisma } from "@/server/db";
import { isValidJapaneseMobile, toE164 } from "@/lib/phone";
import { normalizeKana, normalizePhone } from "@/lib/normalize-kana";
import {
  findUserByPhoneCandidates,
  findUserByNormalizedNameAndDob,
} from "@/lib/user-uniqueness";
import {
  generateOTP,
  hashOTP,
  getOTPExpiry,
  getSessionExpiry,
  getHourlyResetTime,
  canResend,
  getResendCooldown,
} from "@/lib/otp";
import { sendOTPviaSMS, sendOTPviaSMS_Mock } from "@/lib/sns";
import { ensureSupabasePhoneUser, sendSmsOtpViaSupabase } from "@/lib/supabase/otp";

const MAX_HOURLY_SENDS = 5;
const RESEND_COOLDOWN = 60;
const USE_SUPABASE_SMS_OTP = process.env.USE_SUPABASE_SMS_OTP === "true";

const InitialRegistrationSchema = z.object({
  phoneNumber: z.string().min(10),
  familyName: z.string().min(1),
  givenName: z.string().min(1),
  familyNameKana: z.string().min(1),
  givenNameKana: z.string().min(1),
  dateOfBirth: z.string().min(1),
  sex: z.enum(["MALE", "FEMALE", "OTHER"]),
  postalCode: z.string().regex(/^\d{7}$/, "郵便番号は7桁の数字で入力してください"),
  prefecture: z.string().min(1, "都道府県を入力してください"),
  city: z.string().min(1, "市区町村を入力してください"),
  addressLine1: z.string().min(1, "町名・番地を入力してください"),
  addressLine2: z.string().optional().transform((val) => val || undefined),
  emergencyContactFamilyName: z.string().min(1, "緊急連絡先の姓を入力してください"),
  emergencyContactGivenName: z.string().min(1, "緊急連絡先の名を入力してください"),
  emergencyContactFamilyNameKana: z.string().min(1, "緊急連絡先の姓（カナ）を入力してください"),
  emergencyContactGivenNameKana: z.string().min(1, "緊急連絡先の名（カナ）を入力してください"),
  emergencyContactPhone: z.string().min(10, "緊急連絡先の電話番号を入力してください"),
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(8, "パスワードは8文字以上で入力してください"),
  resend: z.literal(false).optional(),
});

const ResendRegistrationSchema = z.object({
  phoneNumber: z.string().min(10),
  resend: z.literal(true),
});

const StartRegistrationSchema = z.union([
  InitialRegistrationSchema,
  ResendRegistrationSchema,
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const ip = getTrustedClientIp(req);
    if (isLoginIpBlocklisted(ip)) {
      return NextResponse.json(
        { error: "現在このネットワークからはご利用いただけません" },
        { status: 403 }
      );
    }
    const skipIpSlot = ip === "127.0.0.1" || ip === "::1";
    if (!skipIpSlot) {
      const slot = await tryConsumeRateSlot(
        throttleKeyRegistrationStartIp(ip),
        REGISTRATION_START_IP_MAX,
        REGISTRATION_START_IP_WINDOW_MS
      );
      if (!slot.allowed) {
        return NextResponse.json(
          {
            error:
              "短時間にリクエストが繰り返されました。しばらく時間をおいてから再度お試しください。",
          },
          {
            status: 429,
            headers: { "Retry-After": String(slot.retryAfterSec) },
          }
        );
      }
    }

    const data = StartRegistrationSchema.parse(body);

    if (!isValidJapaneseMobile(data.phoneNumber)) {
      return NextResponse.json(
        { error: "有効な日本国内の携帯電話番号を入力してください" },
        { status: 400 }
      );
    }

    const phoneE164 = toE164(data.phoneNumber);

    if (data.resend) {
      const existingSession = await prisma.registrationSession.findFirst({
        where: { phoneNumber: phoneE164 },
        orderBy: { createdAt: "desc" },
      });

      if (!existingSession) {
        return NextResponse.json(
          { error: "登録セッションが見つかりません。最初からやり直してください。" },
          { status: 404 }
        );
      }

      if (new Date() > existingSession.expiresAt) {
        await prisma.registrationSession.delete({ where: { id: existingSession.id } });
        return NextResponse.json(
          { error: "登録セッションの有効期限が切れました。最初からやり直してください。" },
          { status: 400 }
        );
      }

      if (!canResend(existingSession.lastSentAt, RESEND_COOLDOWN)) {
        const cooldown = getResendCooldown(existingSession.lastSentAt, RESEND_COOLDOWN);
        return NextResponse.json(
          {
            error: `再送は${cooldown}秒後に可能です`,
            cooldown,
          },
          { status: 429 }
        );
      }

      const now = new Date();
      if (now < existingSession.hourlyResetAt && existingSession.sendCount >= MAX_HOURLY_SENDS) {
        return NextResponse.json(
          { error: "1時間あたりの送信回数を超過しました。しばらくしてから再度お試しください。" },
          { status: 429 }
        );
      }

      const otp = generateOTP();
      const otpHash = await hashOTP(otp);

      const updatedSession = await prisma.registrationSession.update({
        where: { id: existingSession.id },
        data: {
          otpHash,
          otpAttempts: 0,
          otpExpiresAt: getOTPExpiry(),
          lastSentAt: now,
          sendCount: now >= existingSession.hourlyResetAt ? 1 : existingSession.sendCount + 1,
          hourlyResetAt:
            now >= existingSession.hourlyResetAt
              ? getHourlyResetTime()
              : existingSession.hourlyResetAt,
          expiresAt: getSessionExpiry(),
        },
      });

      if (USE_SUPABASE_SMS_OTP) {
        await ensureSupabasePhoneUser(phoneE164);
        await sendSmsOtpViaSupabase(phoneE164);
      } else if (process.env.NODE_ENV === "development" && process.env.SKIP_SMS === "true") {
        await sendOTPviaSMS_Mock(phoneE164, otp);
      } else {
        await sendOTPviaSMS(phoneE164, otp);
      }

      return NextResponse.json({
        sessionId: updatedSession.id,
        message: "認証コードを再送信しました",
        resent: true,
      });
    }

    const normalizedEmail = data.email.trim().toLowerCase();

    const existingPhone = await findUserByPhoneCandidates([
      phoneE164,
      normalizePhone(data.phoneNumber),
    ]);

    if (existingPhone) {
      return NextResponse.json(
        {
          error: "この電話番号は既に登録されています。ログインしてください。",
          existingUser: true,
        },
        { status: 400 }
      );
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingEmail) {
      return NextResponse.json(
        { error: "このメールアドレスは既に登録されています" },
        { status: 400 }
      );
    }

    const normalizedFamilyName = normalizeKana(data.familyNameKana);
    const normalizedGivenName = normalizeKana(data.givenNameKana);
    const dateOfBirth = new Date(data.dateOfBirth);

    const duplicatePerson = await findUserByNormalizedNameAndDob({
      normalizedFamilyName,
      normalizedGivenName,
      dateOfBirth,
    });

    if (duplicatePerson) {
      return NextResponse.json(
        {
          error: "同じ氏名・生年月日のアカウントが既に存在します。",
          existingUser: true,
        },
        { status: 400 }
      );
    }

    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    const bcrypt = await import("bcrypt");
    const passwordHash = await bcrypt.hash(data.password, 10);

    const session = await prisma.registrationSession.create({
      data: {
        phoneNumber: phoneE164,
        familyName: data.familyName,
        givenName: data.givenName,
        familyNameKana: data.familyNameKana,
        givenNameKana: data.givenNameKana,
        dateOfBirth,
        sex: data.sex,
        postalCode: data.postalCode,
        prefecture: data.prefecture,
        city: data.city,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        emergencyContactFamilyName: data.emergencyContactFamilyName,
        emergencyContactGivenName: data.emergencyContactGivenName,
        emergencyContactFamilyNameKana: data.emergencyContactFamilyNameKana,
        emergencyContactGivenNameKana: data.emergencyContactGivenNameKana,
        emergencyContactPhone: data.emergencyContactPhone,
        email: normalizedEmail,
        password: passwordHash,
        otpHash,
        otpExpiresAt: getOTPExpiry(),
        hourlyResetAt: getHourlyResetTime(),
        expiresAt: getSessionExpiry(),
      },
    });

    if (USE_SUPABASE_SMS_OTP) {
      await ensureSupabasePhoneUser(phoneE164);
      await sendSmsOtpViaSupabase(phoneE164);
    } else if (process.env.NODE_ENV === "development" && process.env.SKIP_SMS === "true") {
      await sendOTPviaSMS_Mock(phoneE164, otp);
    } else {
      await sendOTPviaSMS(phoneE164, otp);
    }

    return NextResponse.json({
      sessionId: session.id,
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

    return jsonInternalError500("POST api/registration/start/route.ts", error);
  }
}
