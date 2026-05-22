// POST /api/user/phone-change/verify
// 電話番号変更のOTP検証と更新
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { verifyOTP } from "@/lib/otp";
import { sendSecurityNoticeSms } from "@/lib/sns";
import { phoneToE164Loose } from "@/lib/phone";
import { zE164Mobile } from "@/lib/zodPhone";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { LoginSessionPurpose } from "@prisma/client";

const PhoneChangeVerifySchema = z.object({
  phone: zE164Mobile(),
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

    const session = await prisma.loginSession.findFirst({
      where: {
        userId: sess.userId,
        purpose: LoginSessionPurpose.PHONE_CHANGE,
        phoneNumber: data.phone,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "セッションが見つかりません。最初からやり直してください。" },
        { status: 404 }
      );
    }

    // OTP有効期限チェック
    if (session.otpExpiresAt < new Date()) {
      await prisma.loginSession.delete({ where: { id: session.id } });
      return NextResponse.json(
        { error: "確認コードの有効期限が切れました。最初からやり直してください。" },
        { status: 400 }
      );
    }

    // 試行回数チェック
    if (session.otpAttempts >= 5) {
      await prisma.loginSession.delete({ where: { id: session.id } });
      return NextResponse.json(
        { error: "試行回数の上限に達しました。最初からやり直してください。" },
        { status: 429 }
      );
    }

    // OTP検証
    const isValid = await verifyOTP(data.otp, session.otpHash);
    if (!isValid) {
      await prisma.loginSession.update({
        where: { id: session.id },
        data: { otpAttempts: session.otpAttempts + 1 },
      });

      return NextResponse.json(
        { error: "確認コードが正しくありません" },
        { status: 401 }
      );
    }

    const before = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { contact: { select: { phoneNumber: true } } },
    });
    const oldPhone = before?.contact?.phoneNumber;

    await prisma.user.update({
      where: { id: sess.userId },
      data: {
        contact: {
          upsert: {
            create: {
              phoneNumber: data.phone,
              phoneVerified: true,
              phoneVerifiedAt: new Date(),
            },
            update: {
              phoneNumber: data.phone,
              phoneVerified: true,
              phoneVerifiedAt: new Date(),
            },
          },
        },
      },
    });

    await prisma.loginSession.delete({ where: { id: session.id } });

    if (oldPhone && oldPhone !== data.phone) {
      try {
        await sendSecurityNoticeSms(
          phoneToE164Loose(oldPhone),
          "Bluvium: 登録電話番号が変更されました。心当たりがない場合は至急サポートへご連絡ください。"
        );
      } catch (e) {
        console.error("Phone change notice SMS failed:", e);
      }
    }

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

    return jsonInternalError500("POST api/user/phone-change/verify/route.ts", error);
  }
}
