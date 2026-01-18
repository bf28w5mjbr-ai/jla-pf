// POST /api/user/phone-change/verify
// 電話番号変更のOTP検証と更新
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { verifyOTP } from "@/lib/otp";

const PhoneChangeVerifySchema = z.object({
  phone: z.string().regex(/^0\d{9,10}$/),
  otp: z.string().length(6),
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
    const data = PhoneChangeVerifySchema.parse(body);

    const session = await prisma.loginSession.findUnique({
      where: { phoneNumber: data.phone },
    });

    if (!session) {
      return NextResponse.json(
        { error: "セッションが見つかりません。最初からやり直してください。" },
        { status: 404 }
      );
    }

    // OTP有効期限チェック
    if (session.otpExpiresAt < new Date()) {
      await prisma.loginSession.delete({ where: { phoneNumber: data.phone } });
      return NextResponse.json(
        { error: "確認コードの有効期限が切れました。最初からやり直してください。" },
        { status: 400 }
      );
    }

    // 試行回数チェック
    if (session.otpAttempts >= 5) {
      await prisma.loginSession.delete({ where: { phoneNumber: data.phone } });
      return NextResponse.json(
        { error: "試行回数の上限に達しました。最初からやり直してください。" },
        { status: 429 }
      );
    }

    // OTP検証
    const isValid = await verifyOTP(data.otp, session.otpHash);
    if (!isValid) {
      await prisma.loginSession.update({
        where: { phoneNumber: data.phone },
        data: { otpAttempts: session.otpAttempts + 1 },
      });

      return NextResponse.json(
        { error: "確認コードが正しくありません" },
        { status: 401 }
      );
    }

    // 電話番号更新
    await prisma.user.update({
      where: { id: sess.userId },
      data: { phoneNumber: data.phone },
    });

    // セッション削除
    await prisma.loginSession.delete({ where: { phoneNumber: data.phone } });

    return NextResponse.json({
      ok: true,
      message: "電話番号を変更しました",
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "入力内容に誤りがあります" },
        { status: 400 }
      );
    }

    console.error("Phone change verify error:", error);
    return NextResponse.json(
      { error: "認証に失敗しました" },
      { status: 500 }
    );
  }
}
