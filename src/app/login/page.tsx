import { Suspense } from "react";
import { Metadata } from "next";
import LoginForm from "./LoginForm";
import { AuthShellBrandedFallback } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "ログイン | Bluvium",
  description: "Bluviumにログイン",
};

function LoginFallback() {
  return <AuthShellBrandedFallback />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
