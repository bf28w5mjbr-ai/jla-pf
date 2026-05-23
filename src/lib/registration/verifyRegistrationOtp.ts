import { verifyOTP } from "@/lib/otp";
import { isSupabaseSmsOtpChannelActive } from "@/lib/smsOtpSupabase";
import { verifySmsOtpViaSupabase } from "@/lib/supabase/otp";

export type RegistrationOtpSession = {
  registrationOtpDelivery: string | null;
  phoneNumber: string;
  otpHash: string;
};

/**
 * 登録セッションの OTP 配送方法に応じて検証経路を選ぶ。
 * メール OTP は常にアプリ内 otpHash で検証する。
 */
export async function verifyRegistrationOtp(
  session: RegistrationOtpSession,
  otp: string
): Promise<boolean> {
  if (session.registrationOtpDelivery === "EMAIL") {
    return verifyOTP(otp, session.otpHash);
  }

  if (isSupabaseSmsOtpChannelActive()) {
    try {
      return await verifySmsOtpViaSupabase(session.phoneNumber, otp);
    } catch (error) {
      console.error("[registration/verify] Supabase OTP verification failed:", error);
      return false;
    }
  }

  return verifyOTP(otp, session.otpHash);
}
