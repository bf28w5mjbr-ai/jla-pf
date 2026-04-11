import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import bcrypt from "bcrypt";
import { signSession } from "@/lib/auth";
import { getTrustedClientIp, isLoginIpBlocklisted } from "@/lib/clientIp";
import { onAuthLoginSuccess } from "@/lib/authLoginSuccess";
import {
  isThrottleBlocked,
  recordThrottleFailure,
  resetThrottleKeys,
  throttleKeyPasswordEmail,
  throttleKeyPasswordIp,
  PASSWORD_LOGIN_EMAIL_MAX,
  PASSWORD_LOGIN_EMAIL_WINDOW_MS,
  PASSWORD_LOGIN_IP_MAX,
  PASSWORD_LOGIN_IP_WINDOW_MS,
} from "@/lib/loginThrottle";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    const ip = getTrustedClientIp(req);
    if (isLoginIpBlocklisted(ip)) {
      return NextResponse.json(
        { error: "現在このネットワークからはログインできません" },
        { status: 403 }
      );
    }

    const emailKey = throttleKeyPasswordEmail(email);
    const ipKey = throttleKeyPasswordIp(ip);

    /** unknown はスプーフィング回避のためループバック以外ではレート制限を適用する */
    const skipIpThrottle = ip === "127.0.0.1" || ip === "::1";

    const emailBlocked = await isThrottleBlocked(
      emailKey,
      PASSWORD_LOGIN_EMAIL_MAX,
      PASSWORD_LOGIN_EMAIL_WINDOW_MS
    );
    if (emailBlocked.blocked) {
      return NextResponse.json(
        {
          error:
            "ログイン試行回数が上限に達しました。しばらく時間をおいてから再度お試しください。",
        },
        {
          status: 429,
          headers: { "Retry-After": String(emailBlocked.retryAfterSec) },
        }
      );
    }

    if (!skipIpThrottle) {
      const ipBlocked = await isThrottleBlocked(
        ipKey,
        PASSWORD_LOGIN_IP_MAX,
        PASSWORD_LOGIN_IP_WINDOW_MS
      );
      if (ipBlocked.blocked) {
        return NextResponse.json(
          {
            error:
              "ログイン試行回数が上限に達しました。しばらく時間をおいてから再度お試しください。",
          },
          {
            status: 429,
            headers: { "Retry-After": String(ipBlocked.retryAfterSec) },
          }
        );
      }
    }

    const user = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (!user || !user.passwordHash) {
      if (!skipIpThrottle) {
        await recordThrottleFailure(
          ipKey,
          PASSWORD_LOGIN_IP_MAX,
          PASSWORD_LOGIN_IP_WINDOW_MS
        );
      }
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await recordThrottleFailure(
        emailKey,
        PASSWORD_LOGIN_EMAIL_MAX,
        PASSWORD_LOGIN_EMAIL_WINDOW_MS
      );
      if (!skipIpThrottle) {
        await recordThrottleFailure(
          ipKey,
          PASSWORD_LOGIN_IP_MAX,
          PASSWORD_LOGIN_IP_WINDOW_MS
        );
      }
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    await resetThrottleKeys(
      skipIpThrottle ? [emailKey] : [emailKey, ipKey]
    );

    const token = await signSession({ userId: user.id });

    const jar = await cookies();
    jar.set("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    await onAuthLoginSuccess(user.id, req, { channel: "PASSWORD" });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonInternalError500("POST api/auth/login/route.ts", error);
  }
}
