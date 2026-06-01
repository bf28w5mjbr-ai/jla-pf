export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { cookies } from "next/headers";
import { getTrustedClientIp, isLoginIpBlocklisted } from "@/lib/clientIp";
import {
  tryConsumeRateSlot,
  throttleKeyPasskeyAuthOptionsIp,
  PASSKEY_AUTH_OPTIONS_IP_MAX,
  PASSKEY_AUTH_OPTIONS_IP_WINDOW_MS,
} from "@/lib/loginThrottle";
import { parsePasskeyAuthOptionsBody } from "@/lib/passkeyAuthenticationOptions";
import { webAuthnRequireUserVerification } from "@/lib/webauthnServer";
import { resolveWebAuthnRpId } from "@/lib/webauthnRpId";
import { issuePasskeyAuthAttempt } from "@/lib/passkeyAuthAttemptCookie";

const CHALLENGE_COOKIE = "passkey_auth_challenge";

const WEBAUTHN_TRANSPORTS = new Set(["usb", "nfc", "ble", "internal", "hybrid"]);

function parseStoredTransports(value: unknown): ("usb" | "nfc" | "ble" | "internal" | "hybrid")[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const out: ("usb" | "nfc" | "ble" | "internal" | "hybrid")[] = [];
  for (const t of value) {
    if (typeof t === "string" && WEBAUTHN_TRANSPORTS.has(t)) {
      out.push(t as "usb" | "nfc" | "ble" | "internal" | "hybrid");
    }
  }
  return out.length > 0 ? out : undefined;
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

    const body = await req.json().catch(() => ({}));
    const parsedBody = parsePasskeyAuthOptionsBody(body);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    }

    const skipIpSlot = ip === "127.0.0.1" || ip === "::1";
    if (!skipIpSlot) {
      const slot = await tryConsumeRateSlot(
        throttleKeyPasskeyAuthOptionsIp(ip),
        PASSKEY_AUTH_OPTIONS_IP_MAX,
        PASSKEY_AUTH_OPTIONS_IP_WINDOW_MS
      );
      if (!slot.allowed) {
        return NextResponse.json(
          {
            error:
              "短時間にリクエストが繰り返されました。しばらく時間をおいてから再度お試しください。",
            retryAfterSec: slot.retryAfterSec,
          },
          {
            status: 429,
            headers: { "Retry-After": String(slot.retryAfterSec) },
          }
        );
      }
    }

    const rpID = resolveWebAuthnRpId(req);
    const userVerification = webAuthnRequireUserVerification() ? "required" : "preferred";

    let options;
    if (parsedBody.mode === "discoverable") {
      options = await generateAuthenticationOptions({
        rpID,
        userVerification,
      });
    } else {
      const user = await prisma.user.findUnique({
        where: { email: parsedBody.email },
        select: { id: true },
      });

      const credentials = user
        ? await prisma.passkeyCredential.findMany({
            where: { userId: user.id },
            select: { credentialId: true, transports: true },
          })
        : [];

      if (credentials.length === 0) {
        return NextResponse.json(
          { error: "パスキーが登録されていません" },
          { status: 400 }
        );
      }

      options = await generateAuthenticationOptions({
        rpID,
        userVerification,
        allowCredentials: credentials.map((credential) => {
          const transports = parseStoredTransports(credential.transports);
          return {
            id: isoBase64URL.fromBuffer(credential.credentialId),
            type: "public-key" as const,
            ...(transports ? { transports } : {}),
          };
        }),
      });
    }

    const jar = await cookies();
    const current = jar.get(CHALLENGE_COOKIE)?.value;
    const issued = issuePasskeyAuthAttempt(current, options.challenge);
    jar.set(CHALLENGE_COOKIE, issued.cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 5,
    });

    return NextResponse.json({ ...options, attemptId: issued.attemptId });
  } catch (error) {
    return jsonInternalError500("POST api/passkeys/authentication/options/route.ts", error);
  }
}
