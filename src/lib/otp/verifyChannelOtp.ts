import { verifyOTP } from "@/lib/otp";
import { isSupabaseSmsOtpChannelActive } from "@/lib/smsOtpSupabase";
import { verifySmsOtpViaSupabase } from "@/lib/supabase/otp";

export type VerifyChannelOtpParams = {
  otp: string;
  otpHash: string;
  phoneNumber: string;
  /** true のとき Supabase 設定に関わらず otpHash で検証（メール OTP 等） */
  useStoredOtp: boolean;
  logContext?: string;
};

/**
 * OTP 検証: アプリ内ハッシュ優先、SMS 時は Supabase 経路も選択。
 * Supabase クライアント例外は 500 にせず false を返す。
 */
export async function verifyChannelOtp(params: VerifyChannelOtpParams): Promise<boolean> {
  const { otp, otpHash, phoneNumber, useStoredOtp, logContext = "otp" } = params;

  if (useStoredOtp) {
    return verifyOTP(otp, otpHash);
  }

  if (isSupabaseSmsOtpChannelActive()) {
    try {
      return await verifySmsOtpViaSupabase(phoneNumber, otp);
    } catch (error) {
      console.error(`[${logContext}] Supabase OTP verification failed:`, error);
      return false;
    }
  }

  return verifyOTP(otp, otpHash);
}
