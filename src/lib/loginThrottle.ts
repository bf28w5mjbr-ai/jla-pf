import { createHash } from "crypto";
import { prisma } from "@/server/db";

/** メール＋パスワードログイン: アカウントあたり */
export const PASSWORD_LOGIN_EMAIL_MAX = 8;
export const PASSWORD_LOGIN_EMAIL_WINDOW_MS = 15 * 60 * 1000;

/** メール＋パスワードログイン: IP あたり */
export const PASSWORD_LOGIN_IP_MAX = 25;
export const PASSWORD_LOGIN_IP_WINDOW_MS = 15 * 60 * 1000;

/** SMS ログイン OTP 送信: IP あたり（1 時間） */
export const SMS_LOGIN_START_IP_MAX = 30;
export const SMS_LOGIN_START_IP_WINDOW_MS = 60 * 60 * 1000;

/** パスキー認証オプション取得: IP あたり（1 時間） */
export const PASSKEY_AUTH_OPTIONS_IP_MAX = 40;
export const PASSKEY_AUTH_OPTIONS_IP_WINDOW_MS = 60 * 60 * 1000;

/** 新規登録 SMS 送信（開始・再送）: IP あたり（1 時間） */
export const REGISTRATION_START_IP_MAX = 25;
export const REGISTRATION_START_IP_WINDOW_MS = 60 * 60 * 1000;

export function throttleKeyPasswordEmail(email: string): string {
  const h = createHash("sha256")
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex");
  return `pwd:email:${h}`;
}

export function throttleKeyPasswordIp(ip: string): string {
  return `pwd:ip:${ip}`;
}

export function throttleKeySmsStartIp(ip: string): string {
  return `smsstart:ip:${ip}`;
}

export function throttleKeyPasskeyAuthOptionsIp(ip: string): string {
  return `passkeyopt:ip:${ip}`;
}

export function throttleKeyRegistrationStartIp(ip: string): string {
  return `regstart:ip:${ip}`;
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
