export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { getTrustedClientIp, isLoginIpBlocklisted } from "@/lib/clientIp";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import {
  tryConsumeRateSlot,
  throttleKeyPasskeyAvailabilityEmail,
  throttleKeyPasskeyAvailabilityIp,
  PASSKEY_AVAILABILITY_EMAIL_MAX,
  PASSKEY_AVAILABILITY_EMAIL_WINDOW_MS,
  PASSKEY_AVAILABILITY_IP_MAX,
  PASSKEY_AVAILABILITY_IP_WINDOW_MS,
} from "@/lib/loginThrottle";
import { resolvePasskeyLoginOffered } from "@/lib/passkeyLoginAvailability";

const BodySchema = z.object({
  email: z.string().email().max(320),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getTrustedClientIp(req);
    if (isLoginIpBlocklisted(ip)) {
      return NextResponse.json(
        { error: "現在このネットワークからはログインできません" },
        { status: 403 }
      );
    }

    const skipIpSlot = ip === "127.0.0.1" || ip === "::1";
    if (!skipIpSlot) {
      const ipSlot = await tryConsumeRateSlot(
        throttleKeyPasskeyAvailabilityIp(ip),
        PASSKEY_AVAILABILITY_IP_MAX,
        PASSKEY_AVAILABILITY_IP_WINDOW_MS
      );
      if (!ipSlot.allowed) {
        return NextResponse.json(
          {
            error: "リクエストが集中しています。しばらく時間をおいて再度お試しください。",
            retryAfterSec: ipSlot.retryAfterSec,
          },
          {
            status: 429,
            headers: { "Retry-After": String(ipSlot.retryAfterSec) },
          }
        );
      }
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(zodErrorJsonBody(parsed.error, "validation_message_ja"), {
        status: 400,
      });
    }

    const email = parsed.data.email.trim().toLowerCase();

    const emailSlot = await tryConsumeRateSlot(
      throttleKeyPasskeyAvailabilityEmail(email),
      PASSKEY_AVAILABILITY_EMAIL_MAX,
      PASSKEY_AVAILABILITY_EMAIL_WINDOW_MS
    );
    if (!emailSlot.allowed) {
      return NextResponse.json(
        {
          error: "リクエストが集中しています。しばらく時間をおいて再度お試しください。",
          retryAfterSec: emailSlot.retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(emailSlot.retryAfterSec) },
        }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { _count: { select: { passkeyCredentials: true } } },
    });

    return NextResponse.json({
      passkeyLoginOffered: resolvePasskeyLoginOffered(user),
    });
  } catch (error) {
    return jsonInternalError500(
      "POST api/auth/login/passkey-availability/route.ts",
      error
    );
  }
}
