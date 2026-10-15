import { resolveResendRegistrationFrom } from "@/lib/email/resendRegistrationOtp";
import { sendResendEmail } from "@/lib/email/sendResendEmail";

/** 大会公開ページからの主催問い合わせの PF 宛先（`to` に使用）。本番では必須。 */
export function resolvePlatformCompetitionInquiryEmail(): string {
  return process.env.PLATFORM_COMPETITION_INQUIRY_EMAIL?.trim() ?? "";
}

export function resolveCompetitionInquiryEmailFrom(): string {
  return process.env.COMPETITION_INQUIRY_EMAIL_FROM?.trim() || resolveResendRegistrationFrom();
}

export type SendCompetitionHostInquiryParams = {
  /** Resend の `to`（PF 運用窓口） */
  platformTo: string;
  /** 主催団体管理者など（PF と同一アドレスは呼び出し側で除外済み想定） */
  bcc: string[];
  replyTo: string;
  subject: string;
  textBody: string;
};

/**
 * 大会主催への問い合わせを Resend で 1 通送信する。
 * @throws Error RESEND_API_KEY 未設定、PLATFORM 宛未設定、Preview 許可リスト違反、Resend API 失敗時
 */
export async function sendCompetitionHostInquiryEmail(
  params: SendCompetitionHostInquiryParams
): Promise<void> {
  if (!params.platformTo) {
    throw new Error("PLATFORM_COMPETITION_INQUIRY_EMAIL が未設定です");
  }

  const from = resolveCompetitionInquiryEmailFrom();
  const { id } = await sendResendEmail({
    from,
    to: params.platformTo,
    bcc: params.bcc.length > 0 ? params.bcc : undefined,
    replyTo: params.replyTo,
    subject: params.subject,
    text: params.textBody,
  });

  console.info("[Resend] competition host inquiry accepted", {
    id,
    toCount: 1,
    bccCount: params.bcc.length,
  });
}
