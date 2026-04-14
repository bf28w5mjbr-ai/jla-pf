import type { Metadata } from "next";
import { ForgotPasswordContent } from "./ForgotPasswordContent";

export const metadata: Metadata = {
  title: "パスワードをお忘れの方 | Bluvium",
  description: "パスワードを忘れた場合のログイン方法（パスキー・環境により SMS）とお問い合わせ先の案内です。",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordContent />;
}
