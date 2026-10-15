import { maskEmailForHint } from "@/lib/email/maskEmail";
import { resolveResendRegistrationFrom } from "@/lib/email/resendRegistrationOtp";
import { sendResendEmail } from "@/lib/email/sendResendEmail";

/**
 * パスワード再設定用リンクを Resend で送信する。
 * @throws {Error} RESEND_API_KEY 未設定、Preview 許可リスト違反、または API 失敗時
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const from = resolveResendRegistrationFrom();
  const { id } = await sendResendEmail({
    from,
    to,
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
  });
  console.info("[Resend] password reset email accepted", {
    id,
    toHint: maskEmailForHint(to),
  });
}
