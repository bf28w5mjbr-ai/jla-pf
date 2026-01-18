// POST /api/registration/start
// 基本情報入力 → SMS OTP送信
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { isValidJapaneseMobile, toE164 } from "@/lib/phone";
import { normalizeKana } from "@/lib/normalize-kana";
import { 
  generateOTP, 
  hashOTP, 
  getOTPExpiry, 
  getSessionExpiry,
  getHourlyResetTime,
  canResend,
  getResendCooldown
} from "@/lib/otp";
import { sendOTPviaSMS, sendOTPviaSMS_Mock } from "@/lib/sns";

const StartRegistrationSchema = z.object({
  phoneNumber: z.string().min(10),
  familyName: z.string().min(1),
  givenName: z.string().min(1),
  familyNameKana: z.string().min(1),
  givenNameKana: z.string().min(1),
  dateOfBirth: z.string().min(1),
  sex: z.enum(['MALE', 'FEMALE', 'OTHER']),
  postalCode: z.string().regex(/^\d{7}$/, "郵便番号は7桁の数字で入力してください"),
  prefecture: z.string().min(1, "都道府県を入力してください"),
  city: z.string().min(1, "市区町村を入力してください"),
  addressLine1: z.string().min(1, "町名・番地を入力してください"),
  addressLine2: z.string().optional().transform(val => val || undefined),
  emergencyContactFamilyName: z.string().min(1, "緊急連絡先の姓を入力してください"),
  emergencyContactGivenName: z.string().min(1, "緊急連絡先の名を入力してください"),
  emergencyContactFamilyNameKana: z.string().min(1, "緊急連絡先の姓（カナ）を入力してください"),
  emergencyContactGivenNameKana: z.string().min(1, "緊急連絡先の名（カナ）を入力してください"),
  emergencyContactPhone: z.string().min(10, "緊急連絡先の電話番号を入力してください"),
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(8, "パスワードは8文字以上で入力してください"),
  resend: z.boolean().optional(), // 再送フラグ
});

const MAX_HOURLY_SENDS = 5; // 1時間に5回まで
const RESEND_COOLDOWN = 60; // 60秒のクールダウン

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    console.log('[DEBUG] Registration start request:', JSON.stringify(body, null, 2));
    const data = StartRegistrationSchema.parse(body);

    // 1. 電話番号バリデーション
    if (!isValidJapaneseMobile(data.phoneNumber)) {
      return NextResponse.json(
        { error: "有効な日本国内の携帯電話番号を入力してください" },
        { status: 400 }
      );
    }

    const phoneE164 = toE164(data.phoneNumber);

    // 2. 既存ユーザーチェック
    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber: phoneE164 },
    });

    if (existingUser) {
      return NextResponse.json(
        { 
          error: "この電話番号は既に登録されています。ログインしてください。",
          existingUser: true
        },
        { status: 400 }
      );
    }

    // 3. 正規化処理
    const normalizedFamilyName = normalizeKana(data.familyNameKana);
    const normalizedGivenName = normalizeKana(data.givenNameKana);
    const dateOfBirth = new Date(data.dateOfBirth);

    // 4. 氏名+生年月日の重複チェック
    const duplicatePerson = await prisma.user.findFirst({
      where: {
        normalizedFamilyName,
        normalizedGivenName,
        dateOfBirth,
      },
    });

    if (duplicatePerson) {
      return NextResponse.json(
        {
          error: "同じ氏名・生年月日のアカウントが既に存在します。",
          existingUser: true
        },
        { status: 400 }
      );
    }

    // 5. 既存セッション取得（再送の場合）
    const existingSession = await prisma.registrationSession.findFirst({
      where: { phoneNumber: phoneE164 },
      orderBy: { createdAt: 'desc' },
    });

    if (data.resend && existingSession) {
      // 再送制限チェック
      if (!canResend(existingSession.lastSentAt, RESEND_COOLDOWN)) {
        const cooldown = getResendCooldown(existingSession.lastSentAt, RESEND_COOLDOWN);
        return NextResponse.json(
          { 
            error: `再送は${cooldown}秒後に可能です`,
            cooldown
          },
          { status: 429 }
        );
      }

      // 1時間制限チェック
      const now = new Date();
      if (now < existingSession.hourlyResetAt && existingSession.sendCount >= MAX_HOURLY_SENDS) {
        return NextResponse.json(
          { error: "1時間あたりの送信回数を超過しました。しばらくしてから再度お試しください。" },
          { status: 429 }
        );
      }

      // 新しいOTP生成
      const otp = generateOTP();
      const otpHash = await hashOTP(otp);

      // セッション更新
      const updatedSession = await prisma.registrationSession.update({
        where: { id: existingSession.id },
        data: {
          otpHash,
          otpAttempts: 0, // リセット
          otpExpiresAt: getOTPExpiry(),
          lastSentAt: now,
          sendCount: now >= existingSession.hourlyResetAt ? 1 : existingSession.sendCount + 1,
          hourlyResetAt: now >= existingSession.hourlyResetAt ? getHourlyResetTime() : existingSession.hourlyResetAt,
          expiresAt: getSessionExpiry(), // セッション期限も延長
        },
      });

      // SMS送信
      if (process.env.NODE_ENV === 'development' && process.env.SKIP_SMS === 'true') {
        await sendOTPviaSMS_Mock(phoneE164, otp);
      } else {
        await sendOTPviaSMS(phoneE164, otp);
      }

      return NextResponse.json({
        sessionId: updatedSession.id,
        message: "認証コードを再送信しました",
        resent: true
      });
    }

    // 6. 新規セッション作成
    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    
    // パスワードがある場合はハッシュ化
    let passwordHash: string | undefined = undefined;
    if (data.password && data.password.length >= 8) {
      const bcrypt = await import('bcrypt');
      passwordHash = await bcrypt.hash(data.password, 10);
    }

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
        email: data.email,
        password: passwordHash,
        otpHash,
        otpExpiresAt: getOTPExpiry(),
        hourlyResetAt: getHourlyResetTime(),
        expiresAt: getSessionExpiry(),
      },
    });

    // 7. SMS送信
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_SMS === 'true') {
      await sendOTPviaSMS_Mock(phoneE164, otp);
    } else {
      await sendOTPviaSMS(phoneE164, otp);
    }

    return NextResponse.json({
      sessionId: session.id,
      message: "認証コードを送信しました",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[DEBUG] Zod validation error:', JSON.stringify(error.errors, null, 2));
      return NextResponse.json(
        { error: "入力内容に誤りがあります", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Registration start error:", error);
    return NextResponse.json(
      { error: "登録処理に失敗しました" },
      { status: 500 }
    );
  }
}
