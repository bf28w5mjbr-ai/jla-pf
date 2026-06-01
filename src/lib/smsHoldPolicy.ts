/**
 * SMS 送信の運用フラグ（電話番号変更・セキュリティ通知など非認証用途）。
 * ログイン・新規登録の OTP はメールのみ。
 */

export function isSmsOutboundHeld(): boolean {
  return process.env.SKIP_SMS === "true";
}

/** 新規登録 OTP は常にメール（Resend） */
export function registrationUsesEmailOtp(): boolean {
  return true;
}

/** `/api/health` 等に載せる公開フラグ（秘密は含めない） */
export function getAuthPublicFlags() {
  return {
    registrationEmailOtp: true,
    resendApiKeyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    smsOutboundHeld: isSmsOutboundHeld(),
  };
}

/** @deprecated 互換のため残す。getAuthPublicFlags を利用すること。 */
export function getSmsAuthPublicFlags() {
  return getAuthPublicFlags();
}

/**
 * メール登録 OTP 有効時に不足しがちな設定を列挙（503 ではなく warnings として返す想定）。
 */
export function getRegistrationEmailOtpConfigWarnings(): string[] {
  const warnings: string[] = [];

  if (!process.env.RESEND_API_KEY?.trim()) {
    warnings.push("registration_email_otp_enabled_but_resend_api_key_missing");
  }

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret || authSecret.length < 32) {
    warnings.push("auth_secret_missing_or_too_short_for_session_issue");
  }

  return warnings;
}
