import { registrationUsesEmailOtp } from "@/lib/smsHoldPolicy";
import { isSupabaseSmsOtpChannelActive } from "@/lib/smsOtpSupabase";
import { sendOTPviaSMS, sendOTPviaSMS_Mock } from "@/lib/sns";
import { sendRegistrationOtpEmail } from "@/lib/email/resendRegistrationOtp";
import { ensureSupabasePhoneUser, sendSmsOtpViaSupabase } from "@/lib/supabase/otp";

export type RegistrationOtpDeliveryStored = "SMS" | "EMAIL";

type SendArgs = {
  phoneE164: string;
  otp: string;
  /** メール OTP 時に必須 */
  emailForOtp: string | null;
};

/**
 * 登録フローの OTP を届け、DB に保存する値（SMS / EMAIL）を返す。
 */
export async function sendRegistrationOtpDelivery(
  args: SendArgs
): Promise<RegistrationOtpDeliveryStored> {
  const { phoneE164, otp, emailForOtp } = args;

  if (registrationUsesEmailOtp()) {
    if (!emailForOtp?.trim()) {
      throw new Error("REGISTRATION_EMAIL_OTP requires registration email");
    }
    if (!process.env.RESEND_API_KEY?.trim()) {
      throw new Error("RESEND_API_KEY_REQUIRED");
    }
    await sendRegistrationOtpEmail(emailForOtp.trim().toLowerCase(), otp);
    return "EMAIL";
  }

  if (isSupabaseSmsOtpChannelActive()) {
    await ensureSupabasePhoneUser(phoneE164);
    await sendSmsOtpViaSupabase(phoneE164);
    return "SMS";
  }

  if (process.env.NODE_ENV === "development" && process.env.SKIP_SMS === "true") {
    await sendOTPviaSMS_Mock(phoneE164, otp);
    return "SMS";
  }

  await sendOTPviaSMS(phoneE164, otp);
  return "SMS";
}

/**
 * 再送時: 既存セッションがメール OTP ならメールへ再送（設定 OFF 後も同一セッションは維持）。
 */
export async function sendRegistrationOtpResendDelivery(
  args: SendArgs & {
    priorDelivery: string | null;
  }
): Promise<RegistrationOtpDeliveryStored> {
  const { phoneE164, otp, emailForOtp, priorDelivery } = args;

  const useEmail =
    priorDelivery === "EMAIL" ||
    (registrationUsesEmailOtp() && !!emailForOtp?.trim());

  if (useEmail) {
    if (!emailForOtp?.trim()) {
      throw new Error("REGISTRATION_EMAIL_OTP requires registration email");
    }
    if (!process.env.RESEND_API_KEY?.trim()) {
      throw new Error("RESEND_API_KEY_REQUIRED");
    }
    await sendRegistrationOtpEmail(emailForOtp.trim().toLowerCase(), otp);
    return "EMAIL";
  }

  return sendRegistrationOtpDelivery({ phoneE164, otp, emailForOtp: null });
}
