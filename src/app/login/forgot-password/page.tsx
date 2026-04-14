import type { Metadata } from "next";
import { ForgotPasswordContent } from "./ForgotPasswordContent";

export const metadata: Metadata = {
  title: "パスワードをお忘れの方 | Bluvium",
  description:
    "パスワードを忘れた場合の再設定（メールリンク・有効期限1時間）、パスキー・環境により SMS、お問い合わせ先の案内です。",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordContent />;
}
