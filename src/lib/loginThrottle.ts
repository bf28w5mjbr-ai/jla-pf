import { createHash } from "crypto";
import { prisma } from "@/server/db";

/** メール＋パスワードログイン: アカウントあたり */
export const PASSWORD_LOGIN_EMAIL_MAX = 8;
export const PASSWORD_LOGIN_EMAIL_WINDOW_MS = 15 * 60 * 1000;

/** メール＋パスワードログイン: IP あたり */
export const PASSWORD_LOGIN_IP_MAX = 25;
export const PASSWORD_LOGIN_IP_WINDOW_MS = 15 * 60 * 1000;

/** 新規登録 OTP 送信（開始・再送）: IP あたり（1 時間） */
export const REGISTRATION_START_IP_MAX = 25;
export const REGISTRATION_START_IP_WINDOW_MS = 60 * 60 * 1000;

/** パスキー認証オプション取得: IP あたり（1 時間） */
export const PASSKEY_AUTH_OPTIONS_IP_MAX = 80;
export const PASSKEY_AUTH_OPTIONS_IP_WINDOW_MS = 60 * 60 * 1000;

/** パスキー認証検証: IP あたりの失敗カウント（15 分） */
export const PASSKEY_AUTH_VERIFY_IP_MAX = 30;
export const PASSKEY_AUTH_VERIFY_IP_WINDOW_MS = 15 * 60 * 1000;

/** パスワード再設定メール依頼: IP あたり（1 時間） */
export const PASSWORD_RESET_REQUEST_IP_MAX = 20;
export const PASSWORD_RESET_REQUEST_IP_WINDOW_MS = 60 * 60 * 1000;

/** パスワード再設定メール送信: メールアドレスあたり（1 時間） */
export const PASSWORD_RESET_SEND_EMAIL_MAX = 5;
export const PASSWORD_RESET_SEND_EMAIL_WINDOW_MS = 60 * 60 * 1000;

/** ログイン画面: パスキー利用可否照会 IP あたり（1 時間） */
export const PASSKEY_AVAILABILITY_IP_MAX = 60;
export const PASSKEY_AVAILABILITY_IP_WINDOW_MS = 60 * 60 * 1000;

/** ログイン画面: パスキー利用可否照会 メールあたり（15 分） */
export const PASSKEY_AVAILABILITY_EMAIL_MAX = 15;
export const PASSKEY_AVAILABILITY_EMAIL_WINDOW_MS = 15 * 60 * 1000;

/** 大会主催問い合わせ: ユーザーあたり（1 時間） */
export const COMPETITION_HOST_INQUIRY_USER_MAX = 8;
export const COMPETITION_HOST_INQUIRY_USER_WINDOW_MS = 60 * 60 * 1000;

/** 大会主催問い合わせ: IP あたり（1 時間） */
export const COMPETITION_HOST_INQUIRY_IP_MAX = 30;
export const COMPETITION_HOST_INQUIRY_IP_WINDOW_MS = 60 * 60 * 1000;

export function throttleKeyPasswordEmail(email: string): string {
  const h = createHash("sha256")
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex");
  return `pwd:email:${h}`;
}

export function throttleKeyPasswordIp(ip: string): string {
  return `pwd:ip:${ip}`;
}

export function throttleKeyPasskeyAuthOptionsIp(ip: string): string {
  return `passkeyopt:ip:${ip}`;
}

export function throttleKeyPasskeyAuthVerifyIp(ip: string): string {
  return `passkeyverify:ip:${ip}`;
}

export function throttleKeyRegistrationStartIp(ip: string): string {
  return `regstart:ip:${ip}`;
}

export function throttleKeyPasswordResetIp(ip: string): string {
  return `pwdreset:ip:${ip}`;
}

export function throttleKeyPasswordResetEmail(email: string): string {
  const h = createHash("sha256")
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex");
  return `pwdreset:email:${h}`;
}

export function throttleKeyPasskeyAvailabilityIp(ip: string): string {
  return `passkeyavail:ip:${ip}`;
}

export function throttleKeyPasskeyAvailabilityEmail(email: string): string {
  const h = createHash("sha256")
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex");
  return `passkeyavail:email:${h}`;
}

export function throttleKeyCompetitionHostInquiryUser(userId: string): string {
  return `hostinquiry:user:${userId}`;
}

export function throttleKeyCompetitionHostInquiryIp(ip: string): string {
  return `hostinquiry:ip:${ip}`;
}

export async function isThrottleBlocked(
  key: string,
  maxFailures: number,
  windowMs: number
): Promise<{ blocked: boolean; retryAfterSec: number }> {
  const row = await prisma.loginThrottleBucket.findUnique({ where: { key } });
  if (!row) return { blocked: false, retryAfterSec: 0 };

  const now = Date.now();
  if (now - row.windowStart.getTime() > windowMs) {
    return { blocked: false, retryAfterSec: 0 };
  }

  if (row.failCount < maxFailures) {
    return { blocked: false, retryAfterSec: 0 };
  }

  const windowEnd = row.windowStart.getTime() + windowMs;
  return {
    blocked: true,
    retryAfterSec: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
  };
}

export async function recordThrottleFailure(
  key: string,
  maxFailures: number,
  windowMs: number
): Promise<{ blocked: boolean; retryAfterSec: number }> {
  const now = Date.now();

  return prisma.$transaction(async (tx) => {
    const row = await tx.loginThrottleBucket.findUnique({ where: { key } });

    let failCount: number;
    let windowStartMs: number;

    if (!row || now - row.windowStart.getTime() > windowMs) {
      const win = new Date(now);
      await tx.loginThrottleBucket.upsert({
        where: { key },
        create: { key, failCount: 1, windowStart: win },
        update: { failCount: 1, windowStart: win },
      });
      failCount = 1;
      windowStartMs = now;
    } else {
      const updated = await tx.loginThrottleBucket.update({
        where: { key },
        data: { failCount: { increment: 1 } },
      });
      failCount = updated.failCount;
      windowStartMs = updated.windowStart.getTime();
    }

    const windowEnd = windowStartMs + windowMs;
    const retryAfterSec = Math.max(1, Math.ceil((windowEnd - now) / 1000));
    return {
      blocked: failCount >= maxFailures,
      retryAfterSec,
    };
  });
}

export async function resetThrottleKeys(keys: string[]): Promise<void> {
  const uniq = [...new Set(keys.filter(Boolean))];
  if (uniq.length === 0) return;
  await prisma.loginThrottleBucket.deleteMany({
    where: { key: { in: uniq } },
  });
}

/**
 * SMS 送信など「成功時にカウントを進める」レート枠。
 */
export async function tryConsumeRateSlot(
  key: string,
  maxAllowed: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const now = Date.now();

  return prisma.$transaction(async (tx) => {
    const row = await tx.loginThrottleBucket.findUnique({ where: { key } });

    if (!row || now - row.windowStart.getTime() > windowMs) {
      await tx.loginThrottleBucket.upsert({
        where: { key },
        create: { key, failCount: 1, windowStart: new Date(now) },
        update: { failCount: 1, windowStart: new Date(now) },
      });
      return { allowed: true, retryAfterSec: 0 };
    }

    if (row.failCount >= maxAllowed) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((row.windowStart.getTime() + windowMs - now) / 1000)
      );
      return { allowed: false, retryAfterSec };
    }

    await tx.loginThrottleBucket.update({
      where: { key },
      data: { failCount: { increment: 1 } },
    });
    return { allowed: true, retryAfterSec: 0 };
  });
}
