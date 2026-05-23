import { verifyChannelOtp } from "@/lib/otp/verifyChannelOtp";

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
  return verifyChannelOtp({
    otp,
    otpHash: session.otpHash,
    phoneNumber: session.phoneNumber,
    useStoredOtp: session.registrationOtpDelivery === "EMAIL",
    logContext: "registration/verify",
  });
}
