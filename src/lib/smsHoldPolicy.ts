/**
 * SMS 実送信を止める運用（SKIP_SMS）と、登録・ログイン周りの挙動切り替え。
 */

export function isSmsOutboundHeld(): boolean {
  return process.env.SKIP_SMS === "true";
}

/**
 * 新規登録の OTP をメールで送る（SKIP_SMS かつ REGISTRATION_EMAIL_OTP=true）。
 * Resend（RESEND_API_KEY）が必須。
 */
export function registrationUsesEmailOtp(): boolean {
  return isSmsOutboundHeld() && process.env.REGISTRATION_EMAIL_OTP === "true";
}

/** SMS OTP ログインの開始 API を許可するか */
export function smsLoginStartAllowed(): boolean {
  return !isSmsOutboundHeld();
}

/** `/api/health` 等に載せる公開フラグ（秘密は含めない） */
export function getSmsAuthPublicFlags() {
  const held = isSmsOutboundHeld();
  return {
    smsLoginAvailable: !held,
    smsOutboundHeld: held,
    registrationEmailOtp: held && process.env.REGISTRATION_EMAIL_OTP === "true",
    resendApiKeyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
  };
}

/**
 * メール登録 OTP 有効時に不足しがちな設定を列挙（503 ではなく warnings として返す想定）。
 */
export function getRegistrationEmailOtpConfigWarnings(): string[] {
  const warnings: string[] = [];
  const flags = getSmsAuthPublicFlags();

  if (!flags.registrationEmailOtp) return warnings;

  if (!flags.resendApiKeyConfigured) {
    warnings.push("registration_email_otp_enabled_but_resend_api_key_missing");
  }

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret || authSecret.length < 32) {
    warnings.push("auth_secret_missing_or_too_short_for_session_issue");
  }

  return warnings;
}
