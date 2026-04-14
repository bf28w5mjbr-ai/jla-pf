export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { getTrustedClientIp, isLoginIpBlocklisted } from "@/lib/clientIp";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import {
  tryConsumeRateSlot,
  throttleKeyPasswordResetIp,
  throttleKeyPasswordResetEmail,
  PASSWORD_RESET_REQUEST_IP_MAX,
  PASSWORD_RESET_REQUEST_IP_WINDOW_MS,
  PASSWORD_RESET_SEND_EMAIL_MAX,
  PASSWORD_RESET_SEND_EMAIL_WINDOW_MS,
} from "@/lib/loginThrottle";
import {
  generatePasswordResetRawToken,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from "@/lib/passwordResetToken";
import { sendPasswordResetEmail } from "@/lib/email/sendPasswordResetEmail";
import { getPublicAppUrl } from "@/lib/appBaseUrl";
import { appendRedirectQuery, safePostLoginPath } from "@/lib/postLoginRedirect";

const BodySchema = z.object({
  email: z.string().email().max(320),
  /** ログイン成功後の遷移先（再設定完了後のログイン画面用・オプション） */
  redirect: z.string().optional(),
});

const NOT_REGISTERED_MESSAGE =
  "このメールアドレスは Bluvium に登録されていないか、パスワード再設定の対象外です。" +
  "お手数ですが、特定商取引法に基づく表示に記載のお問い合わせ先へご連絡ください。";

export async function POST(req: NextRequest) {
  try {
    const ip = getTrustedClientIp(req);
    if (isLoginIpBlocklisted(ip)) {
      return NextResponse.json(
        { error: "現在このネットワークからはご利用いただけません" },
        { status: 403 }
      );
    }

    const skipIpSlot = ip === "127.0.0.1" || ip === "::1";
    if (!skipIpSlot) {
      const ipSlot = await tryConsumeRateSlot(
        throttleKeyPasswordResetIp(ip),
        PASSWORD_RESET_REQUEST_IP_MAX,
        PASSWORD_RESET_REQUEST_IP_WINDOW_MS
      );
      if (!ipSlot.allowed) {
        return NextResponse.json(
          { error: "リクエストが集中しています。しばらく時間をおいて再度お試しください。", retryAfterSec: ipSlot.retryAfterSec },
          { status: 429, headers: { "Retry-After": String(ipSlot.retryAfterSec) } }
        );
      }
    }

    if (!process.env.RESEND_API_KEY?.trim()) {
      return NextResponse.json(
        {
          error:
            "メール送信が構成されていないため、パスワード再設定を開始できません。お問い合わせ先へご連絡ください。",
          code: "EMAIL_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(zodErrorJsonBody(parsed.error, "validation_message_ja"), { status: 400 });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const redirectSafe = safePostLoginPath(parsed.data.redirect ?? null);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      return NextResponse.json(
        {
          ok: false,
          code: "EMAIL_NOT_REGISTERED",
          error: NOT_REGISTERED_MESSAGE,
        },
        { status: 404 }
      );
    }

    const emailSlot = await tryConsumeRateSlot(
      throttleKeyPasswordResetEmail(email),
      PASSWORD_RESET_SEND_EMAIL_MAX,
      PASSWORD_RESET_SEND_EMAIL_WINDOW_MS
    );
    if (!emailSlot.allowed) {
      return NextResponse.json(
        {
          error: "このメールアドレスへの再設定依頼が上限に達しています。しばらく時間をおいて再度お試しください。",
          retryAfterSec: emailSlot.retryAfterSec,
        },
        { status: 429, headers: { "Retry-After": String(emailSlot.retryAfterSec) } }
      );
    }

    const rawToken = generatePasswordResetRawToken();
    const tokenHash = hashPasswordResetToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });

    const base = getPublicAppUrl().replace(/\/$/, "");
    const resetPath = `/login/reset-password?token=${encodeURIComponent(rawToken)}`;
    const resetUrl = redirectSafe
      ? `${base}${appendRedirectQuery(resetPath, redirectSafe)}`
      : `${base}${resetPath}`;

    try {
      await sendPasswordResetEmail(email, resetUrl);
    } catch (e) {
      await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
      console.error("sendPasswordResetEmail", e);
      return NextResponse.json(
        { error: "再設定用メールの送信に失敗しました。しばらくしてから再度お試しください。" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        "入力されたメールアドレス宛に、パスワード再設定用のリンクを送信しました。メールをご確認ください（有効期限は1時間です）。",
    });
  } catch (error) {
    return jsonInternalError500("POST api/auth/password-reset/request/route.ts", error);
  }
}
