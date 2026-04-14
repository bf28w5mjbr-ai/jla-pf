import { maskEmailForHint } from "@/lib/email/maskEmail";
import { resolveResendRegistrationFrom } from "@/lib/email/resendRegistrationOtp";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * パスワード再設定用リンクを Resend で送信する。
 * @throws {Error} RESEND_API_KEY 未設定、または API 失敗時
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY が未設定です");
  }

  const from = resolveResendRegistrationFrom();

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Bluvium パスワード再設定",
      text: [
        "パスワード再設定のリクエストを受け付けました。",
        "",
        "下のリンクを開き、新しいパスワードを入力してください。",
        resetUrl,
        "",
        "このリンクの有効期限は 1 時間です。",
        "心当たりがない場合はこのメールを破棄してください。",
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend が失敗しました (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = (await res.json().catch(() => null)) as { data?: { id?: string } } | null;
  console.info("[Resend] password reset email accepted", {
    id: json?.data?.id,
    toHint: maskEmailForHint(to),
  });
}
