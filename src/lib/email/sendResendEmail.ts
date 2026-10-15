import { assertPreviewEmailRecipientsAllowed } from "@/lib/email/previewEmailAllowlist";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendResendEmailInput = {
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
};

export type SendResendEmailResult = {
  id: string | undefined;
};

function asAddressList(value: string | string[] | undefined): string[] {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value])
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Resend HTTP 送信の単一入口。
 * Vercel Preview では to/cc/bcc が PREVIEW_EMAIL_ALLOWED_RECIPIENTS に含まれる場合のみ送信する。
 * Production の挙動はゲートを通さないため従来どおり。
 */
export async function sendResendEmail(
  input: SendResendEmailInput
): Promise<SendResendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY が未設定です");
  }

  const to = asAddressList(input.to);
  const cc = asAddressList(input.cc);
  const bcc = asAddressList(input.bcc);
  if (to.length === 0) {
    throw new Error("Resend の送信先 (to) が空です");
  }

  assertPreviewEmailRecipientsAllowed([...to, ...cc, ...bcc]);

  const body: Record<string, unknown> = {
    from: input.from,
    to,
    subject: input.subject,
    text: input.text,
  };
  if (cc.length > 0) body.cc = cc;
  if (bcc.length > 0) body.bcc = bcc;
  if (input.replyTo?.trim()) body.reply_to = input.replyTo.trim();

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
  return { id: json?.data?.id };
}
