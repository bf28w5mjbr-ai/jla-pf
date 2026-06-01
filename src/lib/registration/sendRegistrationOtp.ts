import { sendRegistrationOtpEmail } from "@/lib/email/resendRegistrationOtp";

export type RegistrationOtpDeliveryStored = "EMAIL";

type SendArgs = {
  /** メール OTP 送信先 */
  emailForOtp: string;
  otp: string;
};

async function sendRegistrationOtpEmailDelivery(args: SendArgs): Promise<void> {
  const email = args.emailForOtp.trim().toLowerCase();
  if (!email) {
    throw new Error("REGISTRATION_EMAIL_OTP requires registration email");
  }
  if (!process.env.RESEND_API_KEY?.trim()) {
    throw new Error("RESEND_API_KEY_REQUIRED");
  }
  await sendRegistrationOtpEmail(email, args.otp);
}

/**
 * 登録フローの OTP をメールで届ける。
 */
export async function sendRegistrationOtpDelivery(
  args: SendArgs
): Promise<RegistrationOtpDeliveryStored> {
  await sendRegistrationOtpEmailDelivery(args);
  return "EMAIL";
}

/**
 * 再送時もメールへ送信。
 */
export async function sendRegistrationOtpResendDelivery(
  args: SendArgs & { priorDelivery: string | null }
): Promise<RegistrationOtpDeliveryStored> {
  void args.priorDelivery;
  await sendRegistrationOtpEmailDelivery(args);
  return "EMAIL";
}
