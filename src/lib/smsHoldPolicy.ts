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
