/**
 * SMS OTP の送信・検証に Supabase Auth を使うか。
 * SKIP_SMS=true のときは外部 SMS を送らず、アプリ内生成 OTP（otpHash）と検証のみ使う。
 */
export function isSupabaseSmsOtpChannelActive(): boolean {
  return (
    process.env.USE_SUPABASE_SMS_OTP === "true" &&
    process.env.SKIP_SMS !== "true"
  );
}
