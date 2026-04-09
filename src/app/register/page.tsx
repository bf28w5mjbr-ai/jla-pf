import { Metadata } from "next";
import RegisterForm from "@/components/auth/RegisterForm";
import { RegistrationStepper } from "@/components/auth/RegistrationStepper";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "新規登録 | Bluvium",
  description: "Bluviumアカウントを作成",
};

export default function RegisterPage() {
  return (
    <AuthShell
      maxWidth="2xl"
      title="新規登録"
      subtitle="次の3ステップでアカウントを作成します。入力内容はこのタブ内に自動保存されます（タブを閉じると消えます）。"
      subtitleDensity="guided"
    >
      <RegistrationStepper currentStep={1} />
      <RegisterForm />
    </AuthShell>
  );
}
