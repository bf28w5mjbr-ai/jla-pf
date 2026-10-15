import { getPublicAppUrl } from "@/lib/appBaseUrl";
import { maskEmailForHint } from "@/lib/email/maskEmail";
import {
  isResendOnboardingFrom,
  resolveTransactionalEmailFrom,
} from "@/lib/email/resendRegistrationOtp";
import { sendResendEmail } from "@/lib/email/sendResendEmail";

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
  const from = resolveTransactionalEmailFrom();
  if (isResendOnboardingFrom(from)) {
    throw new Error(
      "通知メールには検証済みドメインの送信元が必要です。EMAIL_FROM または REGISTRATION_EMAIL_FROM を設定してください。"
    );
  }
  const link = normalizeNotificationLink(params.linkUrl);
  const { id } = await sendResendEmail({
    from,
    to: params.to,
    subject: `【Bluvium】${params.title}`,
    text: [params.title, "", params.body, "", "通知を確認する:", link].join("\n"),
  });
  console.info("[Resend] notification email accepted", {
    id,
    toHint: maskEmailForHint(params.to),
  });
}
