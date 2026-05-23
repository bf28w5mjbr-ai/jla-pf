// POST /api/auth/login/sms/verify
// SMS OTPログイン: OTP検証 → ログイン
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { isOTPValid } from "@/lib/otp";
import { verifyChannelOtp } from "@/lib/otp/verifyChannelOtp";
import { issueSessionCookie } from "@/lib/auth/issueSessionCookie";
import { AuthLoginChannel } from "@prisma/client";
import { onAuthLoginSuccess } from "@/lib/authLoginSuccess";
import { jsonInternalError500, logApiError } from "@/lib/apiInternalError";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { LoginSessionPurpose } from "@prisma/client";

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

    if (loginSession.purpose !== LoginSessionPurpose.SMS_LOGIN) {
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
    const isValid = await verifyChannelOtp({
      otp: data.otp,
      otpHash: loginSession.otpHash,
      phoneNumber: loginSession.phoneNumber,
      useStoredOtp: false,
      logContext: "auth/login/sms/verify",
    });

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
      where: { id: loginSession.userId },
      include: { contact: true },
    });

    if (!user || user.deletedAt) {
      await prisma.loginSession.delete({ where: { id: loginSession.id } });
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    if (!user.contact?.phoneVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          contact: {
            upsert: {
              create: {
                phoneNumber: loginSession.phoneNumber,
                phoneVerified: true,
                phoneVerifiedAt: new Date(),
              },
              update: {
                phoneVerified: true,
                phoneVerifiedAt: new Date(),
              },
            },
          },
        },
      });
    }

    // 6. ログインセッション削除
    await prisma.loginSession.delete({ where: { id: loginSession.id } });

    // 7. JWTセッション作成
    await issueSessionCookie(user.id);

    try {
      await onAuthLoginSuccess(user.id, req, { channel: AuthLoginChannel.SMS_OTP });
    } catch (loginTrackError) {
      logApiError(
        "POST api/auth/login/sms/verify onAuthLoginSuccess (non-fatal)",
        loginTrackError
      );
    }

    return NextResponse.json({
      ok: true,
      message: "ログインしました"
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        zodErrorJsonBody(error),
        { status: 400 }
      );
    }

    return jsonInternalError500("POST api/auth/login/sms/verify/route.ts", error);
  }
}
