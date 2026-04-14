import type { Metadata } from "next";
import { ResetPasswordContent } from "./ResetPasswordContent";

export const metadata: Metadata = {
  title: "パスワード再設定 | Bluvium",
  description: "メールのリンクから新しいパスワードを設定します。",
};

export default function ResetPasswordPage() {
  return <ResetPasswordContent />;
}
