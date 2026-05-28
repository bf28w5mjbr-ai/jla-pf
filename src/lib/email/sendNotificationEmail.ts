import { getPublicAppUrl } from "@/lib/appBaseUrl";
import { maskEmailForHint } from "@/lib/email/maskEmail";
import { resolveResendRegistrationFrom } from "@/lib/email/resendRegistrationOtp";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendNotificationEmailParams = {
  to: string;
  title: string;
  body: string;
  linkUrl?: string;
};

function normalizeNotificationLink(linkUrl: string | undefined): string {
  const fallbackPath = "/profile/notifications";
  const raw = (linkUrl ?? fallbackPath).trim();
  if (!raw) return `${getPublicAppUrl().replace(/\/$/, "")}${fallbackPath}`;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

  const base = getPublicAppUrl().replace(/\/$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${path}`;
}

export async function sendNotificationEmail(params: SendNotificationEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY が未設定です");
  }

  const from = resolveResendRegistrationFrom();
  const link = normalizeNotificationLink(params.linkUrl);
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: `【Bluvium】${params.title}`,
      text: [
        params.title,
        "",
        params.body,
        "",
        "通知を確認する:",
        link,
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend が失敗しました (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = (await res.json().catch(() => null)) as { data?: { id?: string } } | null;
  console.info("[Resend] notification email accepted", {
    id: json?.data?.id,
    toHint: maskEmailForHint(params.to),
  });
}
