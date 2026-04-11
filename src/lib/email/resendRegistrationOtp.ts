const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * 新規登録用 OTP を Resend で送信する。
 * @throws {Error} RESEND_API_KEY 未設定、または API 失敗時
 */
export async function sendRegistrationOtpEmail(to: string, otp: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY が未設定です");
  }

  const from =
    process.env.REGISTRATION_EMAIL_FROM?.trim() || "Bluvium <onboarding@resend.dev>";

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Bluvium 新規登録の認証コード",
      text: [
        `認証コード: ${otp}`,
        "",
        "有効期限は約5分です。第三者に共有しないでください。",
        "",
        "このメールに心当たりがない場合は破棄してください。",
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend が失敗しました (${res.status}): ${body.slice(0, 500)}`);
  }
}
