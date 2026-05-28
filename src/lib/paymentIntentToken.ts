import { createHash, randomBytes } from "crypto";

/** リンク有効期限の余裕（回答期限より長く保持） */
export const PAYMENT_INTENT_TOKEN_EXTRA_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function generatePaymentIntentRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPaymentIntentToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function computePaymentIntentTokenExpiresAt(responseDeadlineAt: Date): Date {
  const fromDeadline = responseDeadlineAt.getTime();
  const fromNow = Date.now() + PAYMENT_INTENT_TOKEN_EXTRA_TTL_MS;
  return new Date(Math.max(fromDeadline, fromNow));
}
