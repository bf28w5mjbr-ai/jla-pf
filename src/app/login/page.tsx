import { Suspense } from "react";
import { Metadata } from "next";
import LoginForm from "./LoginForm";
import { AuthShellBrandedFallback } from "@/components/auth/AuthShell";
import { redirectIfAuthenticated } from "@/lib/auth";

export const metadata: Metadata = {
  title: "ログイン | Bluvium",
  description: "Bluviumにログイン",
};

function LoginFallback() {
  return <AuthShellBrandedFallback />;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const sp = await searchParams;
  await redirectIfAuthenticated(sp.redirect);

  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
