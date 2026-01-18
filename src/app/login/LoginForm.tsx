// src/app/login/LoginForm.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const rawPassword = password;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password: rawPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        const msg = data?.error ?? "ログインに失敗しました";
        setError(msg);
        toast.error("ログイン失敗", { description: msg });
        if (!normalizedEmail) {
          emailInputRef.current?.focus();
        } else {
          passwordInputRef.current?.focus();
        }
        return;
      }

      toast.success("ログイン成功");
      router.replace("/dashboard");
    } catch (err: any) {
      const msg = "ネットワークエラーが発生しました";
      setError(msg);
      toast.error("接続エラー", { description: msg });
      emailInputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-bold mb-6">ログイン</h1>

      {error && (
        <p
          ref={errorRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4" aria-busy={submitting}>
        <label className="block">
          <span className="text-sm">メールアドレス</span>
          <input
            ref={emailInputRef}
            type="email"
            inputMode="email"
            className="mt-1 w-full rounded border px-3 py-2"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={!!error}
          />
        </label>

        <label className="block">
          <span className="text-sm">パスワード</span>
          <input
            ref={passwordInputRef}
            type="password"
            className="mt-1 w-full rounded border px-3 py-2"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-invalid={!!error}
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
          aria-disabled={submitting}
        >
          {submitting ? "ログイン中..." : "ログイン"}
        </button>

        <div className="text-center space-y-2">
          <Link 
            href="/login/sms" 
            className="block w-full rounded border border-gray-300 px-4 py-2 text-center hover:bg-gray-50"
          >
            📱 SMS認証でログイン
          </Link>
        </div>

        <div className="text-center text-sm text-gray-600">
          アカウントをお持ちでない方は{" "}
          <Link href="/register/sms" className="text-blue-600 hover:underline">
            SMS認証で新規登録
          </Link>
          {" "}または{" "}
          <Link href="/register" className="text-blue-600 hover:underline">
            メールで新規登録
          </Link>
        </div>
      </form>
    </main>
  );
}
