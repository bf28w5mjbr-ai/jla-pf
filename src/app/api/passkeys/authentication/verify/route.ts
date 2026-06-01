export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { cookies } from "next/headers";
import { signSession } from "@/lib/auth";
import { z } from "zod";
import { AuthLoginChannel } from "@prisma/client";
import { onAuthLoginSuccess } from "@/lib/authLoginSuccess";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import {
  resolveWebAuthnExpectedOrigins,
  tryWebAuthnVerifyErrorResponse,
  webAuthnRequireUserVerification,
} from "@/lib/webauthnServer";
import { resolveWebAuthnRpId } from "@/lib/webauthnRpId";
import { getTrustedClientIp, isLoginIpBlocklisted } from "@/lib/clientIp";
import {
  isThrottleBlocked,
  recordThrottleFailure,
  resetThrottleKeys,
  throttleKeyPasskeyAuthVerifyIp,
  PASSKEY_AUTH_VERIFY_IP_MAX,
  PASSKEY_AUTH_VERIFY_IP_WINDOW_MS,
} from "@/lib/loginThrottle";
import { consumePasskeyAuthAttempt } from "@/lib/passkeyAuthAttemptCookie";

type PasskeyWithUser = {
  id: string;
  credentialId: Buffer;
  publicKey: Buffer;
  counter: number;
  userId: string;
  user: { id: string; email: string | null; familyName: string; givenName: string };
};

type PasskeyPrismaClient = typeof prisma & {
  passkeyCredential: {
    findFirst: (args: unknown) => Promise<PasskeyWithUser | null>;
    update: (args: unknown) => Promise<unknown>;
  };
};

const passkeyPrisma = prisma as PasskeyPrismaClient;

const VerifySchema = z.object({
  credential: z.any(),
  attemptId: z.string().uuid(),
});

const CHALLENGE_COOKIE = "passkey_auth_challenge";

function skipPasskeyVerifyIpThrottle(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1";
}

async function notePasskeyVerifyFailure(ip: string): Promise<void> {
  if (skipPasskeyVerifyIpThrottle(ip)) return;
  await recordThrottleFailure(
    throttleKeyPasskeyAuthVerifyIp(ip),
    PASSKEY_AUTH_VERIFY_IP_MAX,
    PASSKEY_AUTH_VERIFY_IP_WINDOW_MS
  );
}

async function notePasskeyVerifySuccess(ip: string): Promise<void> {
  if (skipPasskeyVerifyIpThrottle(ip)) return;
  await resetThrottleKeys([throttleKeyPasskeyAuthVerifyIp(ip)]);
}

export async function POST(req: NextRequest) {
  try {
    const ip = getTrustedClientIp(req);
    if (isLoginIpBlocklisted(ip)) {
      return NextResponse.json(
        { error: "現在このネットワークからはログインできません" },
        { status: 403 }
      );
    }

    if (!skipPasskeyVerifyIpThrottle(ip)) {
      const verifyKey = throttleKeyPasskeyAuthVerifyIp(ip);
      const blocked = await isThrottleBlocked(
        verifyKey,
        PASSKEY_AUTH_VERIFY_IP_MAX,
        PASSKEY_AUTH_VERIFY_IP_WINDOW_MS
      );
      if (blocked.blocked) {
        return NextResponse.json(
          {
            error:
              "パスキー認証の試行回数が上限に達しました。しばらく時間をおいてから再度お試しください。",
            retryAfterSec: blocked.retryAfterSec,
          },
          {
            status: 429,
            headers: { "Retry-After": String(blocked.retryAfterSec) },
          }
        );
      }
    }

    const body = await req.json().catch(() => ({}));
    let data: z.infer<typeof VerifySchema>;
    try {
      data = VerifySchema.parse(body);
    } catch (e) {
      if (e instanceof z.ZodError) {
        await notePasskeyVerifyFailure(ip);
        return NextResponse.json(zodErrorJsonBody(e), { status: 400 });
      }
      throw e;
    }

    const jar = await cookies();
    const consumed = consumePasskeyAuthAttempt(
      jar.get(CHALLENGE_COOKIE)?.value,
      data.attemptId
    );
    if (consumed.cookieValue) {
      jar.set(CHALLENGE_COOKIE, consumed.cookieValue, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 5,
      });
    } else {
      jar.set(CHALLENGE_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    }

    const expectedChallenge = consumed.challenge;
    if (!expectedChallenge) {
      return NextResponse.json(
        { error: "認証セッションの有効期限が切れました。もう一度パスキー認証を開始してください" },
        { status: 400 }
      );
    }

    const rpID = resolveWebAuthnRpId(req);
    const expectedOrigin = resolveWebAuthnExpectedOrigins(req);

    const credentialId = isoBase64URL.toBuffer(data.credential?.id ?? "");

    const credential = await passkeyPrisma.passkeyCredential.findFirst({
      where: { credentialId: Buffer.from(credentialId) },
      include: { user: true },
    });

    if (!credential) {
      await notePasskeyVerifyFailure(ip);
      return NextResponse.json({ error: "パスキーが見つかりません" }, { status: 404 });
    }

    const verification = await verifyAuthenticationResponse({
      response: data.credential,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: webAuthnRequireUserVerification(),
      authenticator: {
        credentialID: isoBase64URL.fromBuffer(credential.credentialId),
        credentialPublicKey: credential.publicKey,
        counter: credential.counter,
      },
    });

    if (!verification.verified || !verification.authenticationInfo) {
      await notePasskeyVerifyFailure(ip);
      return NextResponse.json({ error: "パスキー認証に失敗しました" }, { status: 400 });
    }

    await passkeyPrisma.passkeyCredential.update({
      where: { id: credential.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });

    const token = await signSession({ userId: credential.userId });
    jar.set("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    await onAuthLoginSuccess(credential.userId, req, { channel: AuthLoginChannel.PASSKEY });

    await notePasskeyVerifySuccess(ip);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const ip = getTrustedClientIp(req);

    const mapped = tryWebAuthnVerifyErrorResponse(error);
    if (mapped) {
      await notePasskeyVerifyFailure(ip);
      return mapped;
    }

    return jsonInternalError500(
      "POST api/passkeys/authentication/verify/route.ts",
      error
    );
  }
}
