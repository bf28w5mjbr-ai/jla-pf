import {
  PREVIEW_EMAIL_BLOCKED,
  isPreviewEmailBlockedError,
  isPreviewEmailBlockedMessage,
} from "@/lib/email/previewEmailAllowlist";
import { formatResendRegistrationOtpFailure } from "@/lib/email/resendRegistrationOtp";

export type EmailSendApiFailure = {
  status: number;
  body: { error: string; code?: string };
};

/**
 * 登録 OTP 送信失敗を API レスポンスへ写す。
 * Preview 許可リスト拒否は 503 + PREVIEW_EMAIL_BLOCKED。
 * 宛先・OTP・API キーは body に載せない。
 */
export function mapRegistrationEmailSendError(
  err: unknown
): EmailSendApiFailure | null {
  if (!(err instanceof Error)) return null;

  if (err.message === "RESEND_API_KEY_REQUIRED") {
    return {
      status: 503,
      body: {
        error:
          "メールで登録認証を行うには環境変数 RESEND_API_KEY の設定が必要です。管理者にご連絡ください。",
      },
    };
  }

  if (
    err.message.startsWith("Resend が失敗しました") ||
    isPreviewEmailBlockedMessage(err.message)
  ) {
    const { code, error } = formatResendRegistrationOtpFailure(err.message);
    return { status: 503, body: { error, code } };
  }

  if (err.message.includes("REGISTRATION_EMAIL_OTP requires")) {
    return {
      status: 400,
      body: { error: "登録用メールアドレスが必要です。" },
    };
  }

  if (err.message === "RESEND_API_KEY が未設定です") {
    return {
      status: 503,
      body: {
        error:
          "メールで登録認証を行うには環境変数 RESEND_API_KEY の設定が必要です。管理者にご連絡ください。",
      },
    };
  }

  return null;
}

/** パスワード再設定・主催問い合わせなど汎用メール送信の Preview 拒否。 */
export function mapPreviewEmailBlockedApiFailure(
  err: unknown,
  genericError: string
): EmailSendApiFailure | null {
  if (!isPreviewEmailBlockedError(err)) return null;
  return {
    status: 503,
    body: {
      code: PREVIEW_EMAIL_BLOCKED,
      error: genericError,
    },
  };
}
