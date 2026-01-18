// POST /api/registration/verify
// OTP検証 → User作成
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { verifyOTP, isOTPValid } from "@/lib/otp";
import { normalizeKana } from "@/lib/normalize-kana";

const VerifyOTPSchema = z.object({
  sessionId: z.string().cuid(),
  otp: z.string().regex(/^\d{6}$/, "OTPは6桁の数字です"),
});

const MAX_OTP_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = VerifyOTPSchema.parse(body);

    // 1. セッション取得
    const session = await prisma.registrationSession.findUnique({
      where: { id: data.sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: "セッションが見つかりません" },
        { status: 404 }
      );
    }

    // 2. セッション有効期限チェック
    if (new Date() > session.expiresAt) {
      await prisma.registrationSession.delete({ where: { id: session.id } });
      return NextResponse.json(
        { error: "セッションの有効期限が切れました。最初からやり直してください。" },
        { status: 400 }
      );
    }

    // 3. OTP有効期限チェック
    if (!isOTPValid(session.otpExpiresAt)) {
      return NextResponse.json(
        { error: "認証コードの有効期限が切れました。再送信してください。" },
        { status: 400 }
      );
    }

    // 4. 失敗回数チェック
    if (session.otpAttempts >= MAX_OTP_ATTEMPTS) {
      await prisma.registrationSession.delete({ where: { id: session.id } });
      return NextResponse.json(
        { 
          error: "認証に失敗しました。試行回数の上限に達したため、最初からやり直してください。",
          maxAttemptsReached: true
        },
        { status: 400 }
      );
    }

    // 5. OTP検証
    const isValid = await verifyOTP(data.otp, session.otpHash);

    if (!isValid) {
      // 失敗回数を増やす
      const updatedSession = await prisma.registrationSession.update({
        where: { id: session.id },
        data: { otpAttempts: session.otpAttempts + 1 },
      });

      const remainingAttempts = MAX_OTP_ATTEMPTS - updatedSession.otpAttempts;

      return NextResponse.json(
        { 
          error: `認証コードが正しくありません。残り${remainingAttempts}回`,
          remainingAttempts
        },
        { status: 400 }
      );
    }

    // 6. OTP検証成功 → User作成
    const normalizedFamilyName = normalizeKana(session.familyNameKana);
    const normalizedGivenName = normalizeKana(session.givenNameKana);

    const user = await prisma.user.create({
      data: {
        email: session.email || `${session.phoneNumber.replace('+', '')}@temp.jla.local`,
        emailVerified: session.email ? false : false,
        passwordHash: session.password || null, // パスワードがあればセット（既にハッシュ化済み）
        familyName: session.familyName,
        givenName: session.givenName,
        familyNameKana: session.familyNameKana,
        givenNameKana: session.givenNameKana,
        normalizedFamilyName,
        normalizedGivenName,
        dateOfBirth: session.dateOfBirth,
        sex: session.sex,
        phoneNumber: session.phoneNumber,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
        postalCode: session.postalCode,
        prefecture: session.prefecture,
        city: session.city,
        addressLine1: session.addressLine1,
        addressLine2: session.addressLine2,
        emergencyContactFamilyName: session.emergencyContactFamilyName,
        emergencyContactGivenName: session.emergencyContactGivenName,
        emergencyContactFamilyNameKana: session.emergencyContactFamilyNameKana,
        emergencyContactGivenNameKana: session.emergencyContactGivenNameKana,
        emergencyContactPhone: session.emergencyContactPhone,
      },
    });

    // 7. セッション削除
    await prisma.registrationSession.delete({ where: { id: session.id } });

    // 8. ログインセッション作成（既存のauth.tsを使用）
    const { signSession } = await import("@/lib/auth");
    const token = await signSession({ userId: user.id });

    const { cookies } = await import("next/headers");
    const jar = await cookies();
    jar.set("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30日間
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        familyName: user.familyName,
        givenName: user.givenName,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "入力内容に誤りがあります", details: error.errors },
        { status: 400 }
      );
    }

    console.error("OTP verification error:", error);
    return NextResponse.json(
      { error: "認証処理に失敗しました" },
      { status: 500 }
    );
  }
}
