import { resolveResendRegistrationFrom } from "@/lib/email/resendRegistrationOtp";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

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
 * @throws Error RESEND_API_KEY 未設定、PLATFORM 宛未設定、Resend API 失敗時
 */
export async function sendCompetitionHostInquiryEmail(
  params: SendCompetitionHostInquiryParams
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY が未設定です");
  }
  if (!params.platformTo) {
    throw new Error("PLATFORM_COMPETITION_INQUIRY_EMAIL が未設定です");
  }

  const from = resolveCompetitionInquiryEmailFrom();
  const body: Record<string, unknown> = {
    from,
    to: [params.platformTo],
    subject: params.subject,
    text: params.textBody,
    reply_to: params.replyTo,
  };
  if (params.bcc.length > 0) {
    body.bcc = params.bcc;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Resend が失敗しました (${res.status}): ${errText.slice(0, 500)}`);
  }

  const json = (await res.json().catch(() => null)) as { data?: { id?: string } } | null;
  console.info("[Resend] competition host inquiry accepted", {
    id: json?.data?.id,
    toCount: 1,
    bccCount: params.bcc.length,
  });
}
