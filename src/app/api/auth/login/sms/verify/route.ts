// POST /api/auth/login/sms/verify
// SMS OTPログイン: OTP検証 → ログイン
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { verifyOTP, isOTPValid } from "@/lib/otp";
import { signSession } from "@/lib/auth";
import { cookies } from "next/headers";

const VerifyLoginSchema = z.object({
  sessionId: z.string().cuid(),
  otp: z.string().regex(/^\d{6}$/, "OTPは6桁の数字です"),
});

const MAX_OTP_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = VerifyLoginSchema.parse(body);

    // 1. ログインセッション取得
    const loginSession = await prisma.loginSession.findUnique({
      where: { id: data.sessionId },
    });

    if (!loginSession) {
      return NextResponse.json(
        { error: "セッションが見つかりません" },
        { status: 404 }
      );
    }

    // 2. OTP有効期限チェック
    if (!isOTPValid(loginSession.otpExpiresAt)) {
      return NextResponse.json(
        { error: "認証コードの有効期限が切れました。再送信してください。" },
        { status: 400 }
      );
    }

    // 3. 失敗回数チェック
    if (loginSession.otpAttempts >= MAX_OTP_ATTEMPTS) {
      await prisma.loginSession.delete({ where: { id: loginSession.id } });
      return NextResponse.json(
        { 
          error: "認証に失敗しました。試行回数の上限に達したため、最初からやり直してください。",
          maxAttemptsReached: true
        },
        { status: 400 }
      );
    }

    // 4. OTP検証
    const isValid = await verifyOTP(data.otp, loginSession.otpHash);

    if (!isValid) {
      // 失敗回数を増やす
      const updatedSession = await prisma.loginSession.update({
        where: { id: loginSession.id },
        data: { otpAttempts: loginSession.otpAttempts + 1 },
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

    // 5. ユーザー取得
    const user = await prisma.user.findUnique({
      where: { phoneNumber: loginSession.phoneNumber },
    });

    if (!user) {
      await prisma.loginSession.delete({ where: { id: loginSession.id } });
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    // 6. ログインセッション削除
    await prisma.loginSession.delete({ where: { id: loginSession.id } });

    // 7. JWTセッション作成
    const token = await signSession({ userId: user.id });

    const jar = await cookies();
    jar.set("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30日間
    });

    return NextResponse.json({ 
      ok: true,
      message: "ログインしました"
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "入力内容に誤りがあります", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Login verify error:", error);
    return NextResponse.json(
      { error: "ログイン処理に失敗しました" },
      { status: 500 }
    );
  }
}
