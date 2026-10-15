import { maskEmailForHint } from "@/lib/email/maskEmail";
import { sendResendEmail } from "@/lib/email/sendResendEmail";

const DEFAULT_RESEND_FROM = "Bluvium <onboarding@resend.dev>";

export function resolveResendRegistrationFrom(): string {
  return process.env.REGISTRATION_EMAIL_FROM?.trim() || DEFAULT_RESEND_FROM;
}

/** 大会運用・未決済確認など参加者向けトランザクションメール */
export function resolveTransactionalEmailFrom(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.COMPETITION_INQUIRY_EMAIL_FROM?.trim() ||
    process.env.REGISTRATION_EMAIL_FROM?.trim() ||
    DEFAULT_RESEND_FROM
  );
}

/** Resend のテスト用 From（未検証ドメイン時のフォールバック）か */
export function isResendOnboardingFrom(from: string): boolean {
  return from.toLowerCase().includes("onboarding@resend.dev");
}

/**
 * 新規登録用 OTP を Resend で送信する。
 * @throws {Error} RESEND_API_KEY 未設定、Preview 許可リスト違反、または API 失敗時
 */
export async function sendRegistrationOtpEmail(to: string, otp: string): Promise<void> {
  const from = resolveResendRegistrationFrom();
  const { id } = await sendResendEmail({
    from,
    to,
    subject: "Bluvium 新規登録の認証コード",
    text: [
      `認証コード: ${otp}`,
      "",
      "有効期限は約5分です。第三者に共有しないでください。",
      "",
      "このメールに心当たりがない場合は破棄してください。",
    ].join("\n"),
  });
  console.info("[Resend] registration OTP accepted", {
    id,
    toHint: maskEmailForHint(to),
  });
}

/**
 * Resend 失敗メッセージ（{@link sendRegistrationOtpEmail} の Error.message）からユーザー向け文言を組み立てる。
 * 生の API 本文はレスポンスに含めず、サーバーログ用に fullMessage を出力する。
 */
export function formatResendRegistrationOtpFailure(fullMessage: string): {
  code: string;
  error: string;
} {
  console.error("[Resend] registration OTP:", fullMessage);

  if (
    fullMessage.includes("PREVIEW_EMAIL_ALLOWLIST_UNSET") ||
    fullMessage.includes("PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED")
  ) {
    return {
      code: "PREVIEW_EMAIL_BLOCKED",
      error:
        "認証コードメールの送信に失敗しました。Preview 環境では許可されたテスト用メールアドレス宛のみ送信できます。",
    };
  }

  const code = "RESEND_SEND_FAILED";

  if (!fullMessage.startsWith("Resend が失敗しました")) {
    return {
      code,
      error:
        "認証コードメールの送信に失敗しました。しばらくしてから再度お試しください。",
    };
  }

  const m = fullMessage.match(/\((\d+)\)/);
  const http = m?.[1] ?? "";
  const base =
    "認証コードメールの送信に失敗しました（メール送信サービスが拒否しました）。";

  if (http === "403") {
    const lower = fullMessage.toLowerCase();
    const recipientRestricted =
      lower.includes("only send testing") ||
      lower.includes("own email address") ||
      lower.includes("verify a domain");

    if (recipientRestricted) {
      return {
        code: "RESEND_TEST_FROM_RECIPIENT",
        error: `${base} Resend のテスト用送信元（onboarding@resend.dev）では、原則として Resend アカウントに登録したメールアドレス宛のみ送信できます。登録フォームのメールをそのアドレスにするか、Resend で bluvium.jp などのドメインを検証し、REGISTRATION_EMAIL_FROM を検証済みドメインの From に設定してください。`,
      };
    }

    return {
      code,
      error: `${base} 送信元（Vercel の REGISTRATION_EMAIL_FROM）のドメインが Resend で未検証の可能性が高いです。REGISTRATION_EMAIL_FROM をいったん削除して既定の送信元で試すか、Resend でドメイン検証を完了してください。`,
    };
  }
  if (http === "422") {
    return {
      code,
      error: `${base} From / To が不正か、無料枠の宛先制限などに該当している可能性があります。Resend のダッシュボードでエラー内容を確認してください。`,
    };
  }
  if (http === "429") {
    return {
      code,
      error: `${base} 送信レート制限に達している可能性があります。しばらく時間をおいて再度お試しください。`,
    };
  }

  return {
    code,
    error: `${base} Vercel の Runtime Logs に出力された詳細（HTTP ステータスと JSON）を確認してください。`,
  };
}
