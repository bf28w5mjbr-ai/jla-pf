import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/server/db";

/** クライアント向けは常に同一文言（カード有効性の推測を困難にする） */
export const STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE =
  "決済を開始できませんでした。時間をおいて再度お試しください。";

/**
 * Stripe Checkout（カード）で 3-D セキュアを可能な限り要求する。
 * @see https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-payment_method_options-card-request_three_d_secure
 */
export const stripeCheckoutCardPaymentMethodOptions: Stripe.Checkout.SessionCreateParams.PaymentMethodOptions =
  {
    card: {
      request_three_d_secure: "any",
    },
  };

export function getClientIpFromRequest(req: NextRequest): string | null {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xr = req.headers.get("x-real-ip")?.trim();
  if (xr) return xr;
  return null;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return null;
  }
  return (
    (((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>>
      0)
  );
}

function ipv4MatchesCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const bits = parseInt(bitsRaw ?? "32", 10);
  const ipNum = ipv4ToInt(ip);
  const baseNum = ipv4ToInt(base?.trim() ?? "");
  if (
    ipNum === null ||
    baseNum === null ||
    !Number.isInteger(bits) ||
    bits < 0 ||
    bits > 32
  ) {
    return false;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

function isBlockedIpv4(ip: string, rules: string[]): boolean {
  for (const raw of rules) {
    const rule = raw.trim();
    if (!rule) continue;
    if (rule.includes("/")) {
      if (ipv4MatchesCidr(ip, rule)) return true;
    } else if (ip === rule) {
      return true;
    }
  }
  return false;
}

/**
 * 環境変数 STRIPE_CHECKOUT_BLOCKED_IP_CIDRS（カンマ区切り）に一致する IP からの Checkout 開始を拒否する。
 * IPv4 は単一アドレスまたは CIDR。IPv6 は完全一致のみ。
 */
export function isStripeCheckoutClientIpBlocked(ip: string | null): boolean {
  if (!ip) return false;
  const list =
    process.env.STRIPE_CHECKOUT_BLOCKED_IP_CIDRS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  if (list.length === 0) return false;
  if (ip.includes(":")) {
    return list.includes(ip);
  }
  return isBlockedIpv4(ip, list);
}

function intEnv(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (v == null || v === "") return defaultValue;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultValue;
}

/** 同一ユーザーあたりのエントリー決済 Checkout セッション作成回数（悪質なカード有効性確認の抑制） */
export async function assertEntryStripeCheckoutRateLimit(
  userId: string
): Promise<void> {
  const maxHour = intEnv("STRIPE_ENTRY_CHECKOUT_MAX_PER_HOUR", 20);
  const maxDay = intEnv("STRIPE_ENTRY_CHECKOUT_MAX_PER_DAY", 80);
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [hourly, daily] = await Promise.all([
    prisma.entryCheckoutSession.count({
      where: { userId, createdAt: { gte: hourAgo } },
    }),
    prisma.entryCheckoutSession.count({
      where: { userId, createdAt: { gte: dayAgo } },
    }),
  ]);

  if (hourly >= maxHour || daily >= maxDay) {
    throw new Error("STRIPE_CHECKOUT_RATE_LIMIT");
  }
}

/** 同一団体のオンボーディング Checkout を短時間に連打しない（既定 90 秒） */
export function assertOnboardingCheckoutCooldown(
  payment: {
    stripeCheckoutSessionId: string | null;
    updatedAt: Date;
  } | null
): void {
  const minMs = intEnv("STRIPE_ONBOARDING_CHECKOUT_COOLDOWN_MS", 90_000);
  if (!payment?.stripeCheckoutSessionId) return;
  if (Date.now() - payment.updatedAt.getTime() < minMs) {
    throw new Error("STRIPE_CHECKOUT_COOLDOWN");
  }
}
