// POST /api/registration/verify
// OTP検証 -> User作成
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { verifyOTP, isOTPValid } from "@/lib/otp";
import { normalizeKana } from "@/lib/normalize-kana";
import { isSupabaseSmsOtpChannelActive } from "@/lib/smsOtpSupabase";
import { verifySmsOtpViaSupabase } from "@/lib/supabase/otp";
import { findUserByNormalizedNameAndDob } from "@/lib/user-uniqueness";
import { AuthLoginChannel, Prisma } from "@prisma/client";
import { onAuthLoginSuccess } from "@/lib/authLoginSuccess";
import { jsonInternalError500, logApiError } from "@/lib/apiInternalError";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

const VerifyOTPSchema = z.object({
  sessionId: z.string().cuid(),
  otp: z.string().regex(/^\d{6}$/, "OTPは6桁の数字です"),
});

const MAX_OTP_ATTEMPTS = 5;

function registrationUniqueConstraintResponse(
  error: Prisma.PrismaClientKnownRequestError
): NextResponse | null {
  if (error.code !== "P2002") return null;
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [];
  const targetBlob = fields.join(" ").toLowerCase();

  if (fields.includes("email") || targetBlob.includes("email")) {
    return NextResponse.json(
      {
        error: "このメールアドレスは既に登録されています。最初からやり直してください。",
        existingUser: true,
      },
      { status: 409 }
    );
  }

  if (
    fields.includes("normalizedFamilyName") ||
    fields.includes("normalizedGivenName") ||
    fields.includes("dateOfBirth") ||
    targetBlob.includes("normalizedfamilyname") ||
    targetBlob.includes("normalizedgivenname") ||
    targetBlob.includes("dateofbirth") ||
    targetBlob.includes("userprofile")
  ) {
    return NextResponse.json(
      {
        error: "同じ氏名・生年月日のアカウントが既に存在します。最初からやり直してください。",
        existingUser: true,
      },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { error: "登録情報が既に使用されています。最初からやり直してください。" },
    { status: 409 }
  );
}

export async function POST(req: NextRequest) {
  let sessionIdForCleanup: string | undefined;
  const requestId = req.headers.get("x-request-id") ?? undefined;

  try {
    const body = await req.json().catch(() => ({}));
    const data = VerifyOTPSchema.parse(body);
    sessionIdForCleanup = data.sessionId;

    const session = await prisma.registrationSession.findUnique({
      where: { id: data.sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: "セッションが見つかりません" },
        { status: 404 }
      );
    }

    if (new Date() > session.expiresAt) {
      await prisma.registrationSession.delete({ where: { id: session.id } });
      return NextResponse.json(
        { error: "セッションの有効期限が切れました。最初からやり直してください。" },
        { status: 400 }
      );
    }

    if (!isOTPValid(session.otpExpiresAt)) {
      return NextResponse.json(
        { error: "認証コードの有効期限が切れました。再送信してください。" },
        { status: 400 }
      );
    }

    if (session.otpAttempts >= MAX_OTP_ATTEMPTS) {
      await prisma.registrationSession.delete({ where: { id: session.id } });
      return NextResponse.json(
        {
          error: "認証に失敗しました。試行回数の上限に達したため、最初からやり直してください。",
          maxAttemptsReached: true,
        },
        { status: 400 }
      );
    }

    const valid = isSupabaseSmsOtpChannelActive()
      ? await verifySmsOtpViaSupabase(session.phoneNumber, data.otp)
      : await verifyOTP(data.otp, session.otpHash);

    if (!valid) {
      const updatedSession = await prisma.registrationSession.update({
        where: { id: session.id },
        data: { otpAttempts: session.otpAttempts + 1 },
      });

      const remainingAttempts = MAX_OTP_ATTEMPTS - updatedSession.otpAttempts;

      return NextResponse.json(
        {
          error: `認証コードが正しくありません。残り${remainingAttempts}回`,
          remainingAttempts,
        },
        { status: 400 }
      );
    }

    const normalizedFamilyName = normalizeKana(session.familyNameKana);
    const normalizedGivenName = normalizeKana(session.givenNameKana);

    if (session.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: session.email },
        select: { id: true },
      });

      if (existingEmail) {
        await prisma.registrationSession.delete({ where: { id: session.id } });
        return NextResponse.json(
          {
            error: "このメールアドレスは既に登録されています。最初からやり直してください。",
            existingUser: true,
          },
          { status: 409 }
        );
      }
    }

    const duplicatePerson = await findUserByNormalizedNameAndDob({
      normalizedFamilyName,
      normalizedGivenName,
      dateOfBirth: session.dateOfBirth,
    });

    if (duplicatePerson) {
      await prisma.registrationSession.delete({ where: { id: session.id } });
        return NextResponse.json(
          {
            error: "同じ氏名・生年月日のアカウントが既に存在します。最初からやり直してください。",
            existingUser: true,
          },
          { status: 409 }
        );
    }

    const verifiedPhoneBySms = session.registrationOtpDelivery !== "EMAIL";

    const user = await prisma.user.create({
      data: {
        email: session.email || `${session.phoneNumber.replace("+", "")}@temp.jla.local`,
        security: {
          create: {
            emailVerified: !verifiedPhoneBySms,
            passwordHash: session.password || null,
          },
        },
        profile: {
          create: {
            familyName: session.familyName,
            givenName: session.givenName,
            familyNameKana: session.familyNameKana,
            givenNameKana: session.givenNameKana,
            normalizedFamilyName,
            normalizedGivenName,
            dateOfBirth: session.dateOfBirth,
            sex: session.sex,
          },
        },
        contact: {
          create: {
            phoneNumber: session.phoneNumber,
            phoneVerified: verifiedPhoneBySms,
            phoneVerifiedAt: verifiedPhoneBySms ? new Date() : null,
          },
        },
        address: {
          create: {
            postalCode: session.postalCode,
            prefecture: session.prefecture,
            city: session.city,
            addressLine1: session.addressLine1,
            addressLine2: session.addressLine2,
          },
        },
        emergencyContact: {
          create: {
            familyName: session.emergencyContactFamilyName,
            givenName: session.emergencyContactGivenName,
            familyNameKana: session.emergencyContactFamilyNameKana,
            givenNameKana: session.emergencyContactGivenNameKana,
            phoneNumber: session.emergencyContactPhone,
          },
        },
        jlaProfile: { create: {} },
        nfcTag: { create: {} },
      },
    });

    await prisma.registrationSession.delete({ where: { id: session.id } });

    const { signSession } = await import("@/lib/auth");
    const token = await signSession({ userId: user.id });

    const { cookies } = await import("next/headers");
    const jar = await cookies();
    jar.set("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    try {
      await onAuthLoginSuccess(user.id, req, { channel: AuthLoginChannel.REGISTRATION });
    } catch (loginTrackError) {
      logApiError(
        "POST api/registration/verify onAuthLoginSuccess (non-fatal)",
        loginTrackError,
        { requestId }
      );
    }

    return NextResponse.json({
      success: true,
      next: "/register/passkey",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error), { status: 400 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const conflict = registrationUniqueConstraintResponse(error);
      if (conflict) {
        if (sessionIdForCleanup) {
          await prisma.registrationSession
            .delete({ where: { id: sessionIdForCleanup } })
            .catch(() => {});
        }
        return conflict;
      }
    }

    return jsonInternalError500("POST api/registration/verify/route.ts", error, {
      requestId,
    });
  }
}
