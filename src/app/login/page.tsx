import { Suspense } from "react";
import { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "ログイン | Bluvium",
  description: "Bluviumにログイン",
};

function LoginFallback() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-sm text-muted-foreground">
      読み込み中…
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
