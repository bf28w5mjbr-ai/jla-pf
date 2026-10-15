import { getPublicAppUrl } from "@/lib/appBaseUrl";
import { maskEmailForHint } from "@/lib/email/maskEmail";
import {
  isResendOnboardingFrom,
  resolveTransactionalEmailFrom,
} from "@/lib/email/resendRegistrationOtp";
import { sendResendEmail } from "@/lib/email/sendResendEmail";

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

  try {
    const { id } = await sendResendEmail({
      from,
      to: params.to,
      subject,
      text,
    });
    console.info("[Resend] unpaid entry intent email accepted", {
      id,
      toHint: maskEmailForHint(params.to),
      competitionName: params.competitionName,
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Resend が失敗しました")) {
      const m = err.message.match(/\((\d+)\)/);
      const status = m?.[1] ?? "";
      let hint = "";
      if (status === "403" && err.message.includes("verify a domain")) {
        hint =
          " 環境変数 EMAIL_FROM を Resend で検証済みのドメインの送信元に設定してください（テスト用 onboarding@resend.dev では外部宛に送れません）。";
      } else if (status === "429") {
        hint = " 送信間隔を空けて再試行してください。";
      }
      if (hint) {
        throw new Error(`${err.message}${hint}`);
      }
    }
    throw err;
  }
}

export function buildPaymentIntentPublicUrl(competitionId: string, rawToken: string): string {
  const base = getPublicAppUrl().replace(/\/$/, "");
  const q = new URLSearchParams({ token: rawToken });
  return `${base}/competitions/${competitionId}/entry/payment-intent?${q.toString()}`;
}
