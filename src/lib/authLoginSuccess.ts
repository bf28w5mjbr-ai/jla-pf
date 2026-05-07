import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { getTrustedClientIp } from "@/lib/clientIp";
import { sendSecurityNoticeSms } from "@/lib/sns";
import { phoneToE164Loose } from "@/lib/phone";
import { maskIpForDisplay, truncateUserAgent } from "@/lib/securityDisplay";

export type AuthLoginChannel =
  | "PASSWORD"
  | "SMS_OTP"
  | "PASSKEY"
  | "REGISTRATION";

/**
 * ログイン成功時に最終ログイン情報を更新し、監査ログを残し、
 * SECURITY_LOGIN_ALERT_SMS=true のとき「前回と異なる IP からのログイン」を SMS で通知する。
 */
export async function onAuthLoginSuccess(
  userId: string,
  req: NextRequest,
  options?: { channel?: AuthLoginChannel }
): Promise<void> {
  const ip = getTrustedClientIp(req);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 512);
  const channel = options?.channel ?? "PASSWORD";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      phoneNumber: true,
      lastLoginIp: true,
    },
  });

  if (!user) return;

  const prevIp = user.lastLoginIp;
  const shouldAlert =
    process.env.SECURITY_LOGIN_ALERT_SMS === "true" &&
    prevIp &&
    prevIp !== ip &&
    ip !== "unknown";

  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      lastLoginUa: ua || null,
    },
  });

  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: "USER_LOGIN_SUCCESS",
        target: `user:${userId}`,
        meta: {
          channel,
          ipMasked: maskIpForDisplay(ip),
          uaPrefix: truncateUserAgent(ua, 160),
        },
      },
    });
  } catch (e) {
    console.error("Login audit log failed:", e);
  }

  if (!shouldAlert) return;

  try {
    const to = phoneToE164Loose(user.phoneNumber);
    const securityHint =
      channel === "PASSKEY"
        ? `Bluvium: 新しい環境からログインがありました（IPの一部: ${maskIpForDisplay(ip)}）。心当たりがない場合はプロフィールのセキュリティ設定でパスキーを確認するか、パスワード・電話番号をご確認ください。`
        : `Bluvium: 新しい環境からログインがありました（IPの一部: ${maskIpForDisplay(ip)}）。心当たりがない場合はパスワード・電話番号を確認してください。`;
    await sendSecurityNoticeSms(to, securityHint);
  } catch (e) {
    console.error("Security login SMS alert failed:", e);
  }
}
