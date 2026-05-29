import { getPublicAppUrl } from "@/lib/appBaseUrl";
import { maskEmailForHint } from "@/lib/email/maskEmail";
import {
  isResendOnboardingFrom,
  resolveTransactionalEmailFrom,
} from "@/lib/email/resendRegistrationOtp";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendUnpaidEntryIntentEmailParams = {
  to: string;
  competitionName: string;
  participantName: string;
  responseDeadlineLabel: string;
  intentUrl: string;
};

export async function sendUnpaidEntryIntentEmail(
  params: SendUnpaidEntryIntentEmailParams
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY が未設定です");
  }

  const from = resolveTransactionalEmailFrom();
  if (isResendOnboardingFrom(from)) {
    console.warn(
      "[Resend] unpaid entry intent: テスト用送信元のため外部宛に届かない可能性があります。EMAIL_FROM を検証済みドメインに設定してください。"
    );
  }
  const subject = `【${params.competitionName}】エントリー費のお支払い・出場意思のご確認`;

  const text = [
    `${params.participantName} 様`,
    "",
    `${params.competitionName} のエントリー費が未決済です。`,
    "以下のリンクから大会への出場意思をご回答ください。",
    "",
    params.intentUrl,
    "",
    "■ 出場する場合",
    "回答後、エントリーが成立します。大会当日までに、大会本部でのお支払い、またはリンク先・エントリー画面の支払いフォームからエントリー費用のお支払いをお願いいたします。",
    "",
    "■ 棄権する場合",
    "回答後、エントリーは自動的に取消されます。",
    "",
    `■ 回答期限: ${params.responseDeadlineLabel}`,
    "期限までにご回答がない場合、棄権（欠場）扱いとなる場合があります。",
    "",
    "本メールに心当たりがない場合は、大会主催者へお問い合わせください。",
  ].join("\n");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let hint = "";
    if (res.status === 403 && body.includes("verify a domain")) {
      hint =
        " 環境変数 EMAIL_FROM を Resend で検証済みのドメインの送信元に設定してください（テスト用 onboarding@resend.dev では外部宛に送れません）。";
    } else if (res.status === 429) {
      hint = " 送信間隔を空けて再試行してください。";
    }
    throw new Error(`Resend が失敗しました (${res.status}): ${body.slice(0, 500)}${hint}`);
  }

  const json = (await res.json().catch(() => null)) as { data?: { id?: string } } | null;
  console.info("[Resend] unpaid entry intent email accepted", {
    id: json?.data?.id,
    toHint: maskEmailForHint(params.to),
    competitionName: params.competitionName,
  });
}

export function buildPaymentIntentPublicUrl(competitionId: string, rawToken: string): string {
  const base = getPublicAppUrl().replace(/\/$/, "");
  const q = new URLSearchParams({ token: rawToken });
  return `${base}/competitions/${competitionId}/entry/payment-intent?${q.toString()}`;
}
