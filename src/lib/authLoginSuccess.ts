import type { NextRequest } from "next/server";
import { AuthLoginChannel } from "@prisma/client";
import { prisma } from "@/server/db";
import { getTrustedClientIp } from "@/lib/clientIp";
import { sendSecurityNoticeSms } from "@/lib/sns";
import { phoneToE164Loose } from "@/lib/phone";
import { maskIpForDisplay, truncateUserAgent } from "@/lib/securityDisplay";
import { recordLoginSuccess } from "@/lib/userSecurity";

export { AuthLoginChannel };
export type { AuthLoginChannel as AuthLoginChannelType };

/**
 * ログイン成功時に最終ログイン情報を更新し、ログイン履歴を記録し、監査ログを残し、
 * SECURITY_LOGIN_ALERT_SMS=true のとき「前回と異なる IP からのログイン」を SMS で通知する。
 */
export async function onAuthLoginSuccess(
  userId: string,
  req: NextRequest,
  options?: { channel?: AuthLoginChannel }
): Promise<void> {
  const ip = getTrustedClientIp(req);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 512);
  const channel = options?.channel ?? AuthLoginChannel.PASSWORD;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      contact: { select: { phoneNumber: true } },
      security: { select: { lastLoginIp: true } },
    },
  });

  if (!user) return;

  const prevIp = user.security?.lastLoginIp;
  const shouldAlert =
    process.env.SECURITY_LOGIN_ALERT_SMS === "true" &&
    prevIp &&
    prevIp !== ip &&
    ip !== "unknown";

  await recordLoginSuccess({
    userId,
    channel,
    ip,
    userAgent: ua,
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
    const to = phoneToE164Loose(user.contact?.phoneNumber ?? "");
    const securityHint =
      channel === AuthLoginChannel.PASSKEY
        ? `Bluvium: 新しい環境からログインがありました（IPの一部: ${maskIpForDisplay(ip)}）。心当たりがない場合はプロフィールのセキュリティ設定でパスキーを確認するか、パスワード・電話番号をご確認ください。`
        : `Bluvium: 新しい環境からログインがありました（IPの一部: ${maskIpForDisplay(ip)}）。心当たりがない場合はパスワード・電話番号を確認してください。`;
    await sendSecurityNoticeSms(to, securityHint);
  } catch (e) {
    console.error("Security login SMS alert failed:", e);
  }
}
