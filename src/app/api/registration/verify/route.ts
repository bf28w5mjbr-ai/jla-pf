// POST /api/registration/verify
// OTP検証 -> User作成
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { isOTPValid } from "@/lib/otp";
import { normalizeKana } from "@/lib/normalize-kana";
import { findUserByNormalizedNameAndDob } from "@/lib/user-uniqueness";
import { verifyRegistrationOtp } from "@/lib/registration/verifyRegistrationOtp";
import { issueSessionCookie } from "@/lib/auth/issueSessionCookie";
import { logRegistrationVerifyPhase } from "@/lib/registration/logRegistrationVerifyPhase";
import { registrationUniqueConstraintResponse } from "@/lib/registration/registrationUniqueConstraintResponse";
import {
  buildRegistrationUserCreateInput,
  missingRequiredProfileFields,
} from "@/lib/registration/buildRegistrationUserCreateInput";
import { AuthLoginChannel, Prisma, RegistrationSession } from "@prisma/client";
import { onAuthLoginSuccess } from "@/lib/authLoginSuccess";
import { jsonInternalError500, logApiError } from "@/lib/apiInternalError";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

const VerifyOTPSchema = z.object({
  sessionId: z.string().cuid(),
  otp: z.string().regex(/^\d{6}$/, "OTPは6桁の数字です"),
});

const MAX_OTP_ATTEMPTS = 5;

async function createUserAndDeleteSession(
  session: RegistrationSession,
  normalizedFamilyName: string,
  normalizedGivenName: string
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: buildRegistrationUserCreateInput(
        session,
        normalizedFamilyName,
        normalizedGivenName
      ),
    });
    await tx.registrationSession.delete({ where: { id: session.id } });
    return user;
  });
}

async function issueSessionCookieWithRecovery(
  userId: string,
  email: string | null | undefined,
  requestId?: string
): Promise<{ ok: true; userId: string } | { ok: false }> {
  try {
    await issueSessionCookie(userId);
    logRegistrationVerifyPhase("cookie_set", requestId, { userId });
    return { ok: true, userId };
  } catch (cookieError) {
    logApiError("POST api/registration/verify cookie", cookieError, { requestId });

    if (email) {
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existing && existing.id !== userId) {
        try {
          await issueSessionCookie(existing.id);
          logRegistrationVerifyPhase("cookie_set_recovered", requestId, {
            userId: existing.id,
          });
          return { ok: true, userId: existing.id };
        } catch (retryError) {
          logApiError("POST api/registration/verify cookie recovery", retryError, {
            requestId,
          });
        }
      }
    }

    try {
      await issueSessionCookie(userId);
      logRegistrationVerifyPhase("cookie_set_retry", requestId, { userId });
      return { ok: true, userId };
    } catch (retryError) {
      logApiError("POST api/registration/verify cookie retry", retryError, { requestId });
    }

    return { ok: false };
  }
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

    const valid = await verifyRegistrationOtp(session, data.otp);

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

    logRegistrationVerifyPhase("otp_ok", requestId, { sessionId: session.id });

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

    const missingProfile = missingRequiredProfileFields(session);

    if (missingProfile.length > 0) {
      await prisma.registrationSession.delete({ where: { id: session.id } }).catch(() => {});
      return NextResponse.json(
        {
          error:
            "登録情報が不完全です。入力画面から最初にやり直してください。",
          code: "INCOMPLETE_REGISTRATION_SESSION",
        },
        { status: 400 }
      );
    }

    const user = await createUserAndDeleteSession(
      session,
      normalizedFamilyName,
      normalizedGivenName
    );
    logRegistrationVerifyPhase("user_created", requestId, { userId: user.id });

    const cookieResult = await issueSessionCookieWithRecovery(
      user.id,
      session.email,
      requestId
    );

    if (!cookieResult.ok) {
      return NextResponse.json(
        {
          error:
            "登録は完了しましたがログインセッションの発行に失敗しました。ログインページからお試しください。",
          code: "SESSION_ISSUE_FAILED",
          existingUser: true,
        },
        { status: 409 }
      );
    }

    try {
      await onAuthLoginSuccess(cookieResult.userId, req, {
        channel: AuthLoginChannel.REGISTRATION,
      });
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
      if (error.code === "P2011") {
        if (sessionIdForCleanup) {
          await prisma.registrationSession
            .delete({ where: { id: sessionIdForCleanup } })
            .catch(() => {});
        }
        return NextResponse.json(
          {
            error:
              "登録情報が不完全です。入力画面から最初にやり直してください。",
            code: "INCOMPLETE_REGISTRATION_SESSION",
          },
          { status: 400 }
        );
      }

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
