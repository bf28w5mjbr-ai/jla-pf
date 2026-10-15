/**
 * Vercel Preview 向けの送信先制限。
 * Production / ローカル（VERCEL_ENV !== "preview"）では何もしない。
 */

export const PREVIEW_EMAIL_ALLOWLIST_UNSET = "PREVIEW_EMAIL_ALLOWLIST_UNSET";
export const PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED =
  "PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED";
/** API レスポンス用。宛先・OTP・API キーは含めない。 */
export const PREVIEW_EMAIL_BLOCKED = "PREVIEW_EMAIL_BLOCKED";

export function isPreviewEmailBlockedMessage(message: string): boolean {
  return (
    message.includes(PREVIEW_EMAIL_ALLOWLIST_UNSET) ||
    message.includes(PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED)
  );
}

export function isPreviewEmailBlockedError(err: unknown): boolean {
  return err instanceof Error && isPreviewEmailBlockedMessage(err.message);
}

/** `Name <addr@example.com>` 形式も正規化する。 */
export function normalizeEmailAddress(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const angle = trimmed.match(/<([^>]+)>/);
  const addr = (angle?.[1] ?? trimmed).trim();
  return addr;
}

export function parsePreviewEmailAllowedRecipients(
  raw: string | undefined | null
): string[] {
  if (raw == null) return [];
  return raw
    .split(/[,;\s]+/)
    .map((part) => normalizeEmailAddress(part))
    .filter((part) => part.includes("@"));
}

type EnvLike = Record<string, string | undefined>;

export function isVercelPreviewEnvironment(env: EnvLike = process.env): boolean {
  return env.VERCEL_ENV === "preview";
}

export type PreviewEmailAllowlistDecision =
  | { ok: true; enforced: false }
  | { ok: true; enforced: true }
  | { ok: false; reason: typeof PREVIEW_EMAIL_ALLOWLIST_UNSET }
  | {
      ok: false;
      reason: typeof PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED;
      recipient: string;
    };

/**
 * Preview 以外は常に ok（enforced: false）。
 * Preview では許可リスト未設定・空・非許可宛先を拒否する。
 */
export function evaluatePreviewEmailAllowlist(
  recipients: readonly string[],
  env: EnvLike = process.env
): PreviewEmailAllowlistDecision {
  if (!isVercelPreviewEnvironment(env)) {
    return { ok: true, enforced: false };
  }

  const allowed = new Set(
    parsePreviewEmailAllowedRecipients(env.PREVIEW_EMAIL_ALLOWED_RECIPIENTS)
  );
  if (allowed.size === 0) {
    return { ok: false, reason: PREVIEW_EMAIL_ALLOWLIST_UNSET };
  }

  for (const raw of recipients) {
    const addr = normalizeEmailAddress(raw);
    if (!addr || !allowed.has(addr)) {
      return {
        ok: false,
        reason: PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED,
        recipient: addr || "(empty)",
      };
    }
  }

  return { ok: true, enforced: true };
}

/**
 * Preview で許可されていない宛先への送信を拒否する。
 * @throws Error reason コードを message に含む（API キーは含めない）
 */
export function assertPreviewEmailRecipientsAllowed(
  recipients: readonly string[],
  env: EnvLike = process.env
): void {
  const decision = evaluatePreviewEmailAllowlist(recipients, env);
  if (decision.ok) return;

  if (decision.reason === PREVIEW_EMAIL_ALLOWLIST_UNSET) {
    throw new Error(
      `${PREVIEW_EMAIL_ALLOWLIST_UNSET}: Preview では PREVIEW_EMAIL_ALLOWED_RECIPIENTS の設定が必要です`
    );
  }

  throw new Error(
    `${PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED}: Preview では許可リスト外への送信はできません`
  );
}
