// src/app/login/LoginForm.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { startAuthentication } from "@simplewebauthn/browser";

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [supportsPasskey, setSupportsPasskey] = useState(true);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupportsPasskey(!!window.PublicKeyCredential);
  }, []);

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

  async function onPasskeyLogin() {
    if (!supportsPasskey) {
      toast.error("この端末はパスキーに対応していません");
      return;
    }

    setPasskeyLoading(true);
    setError(null);

    try {
      const optionsRes = await fetch("/api/passkeys/authentication/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const options = await optionsRes.json();

      if (!optionsRes.ok) {
        const msg = options?.error ?? "パスキー認証を開始できませんでした";
        setError(msg);
        toast.error("パスキー認証失敗", { description: msg });
        return;
      }

      const assertion = await startAuthentication(options);

      const verifyRes = await fetch("/api/passkeys/authentication/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: assertion }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        const msg = verifyData?.error ?? "パスキー認証に失敗しました";
        setError(msg);
        toast.error("パスキー認証失敗", { description: msg });
        return;
      }

      toast.success("パスキーでログインしました");
      router.replace("/dashboard");
    } catch (err: any) {
      const msg = err?.message ?? "パスキー認証に失敗しました";
      setError(msg);
      toast.error("パスキー認証失敗", { description: msg });
    } finally {
      setPasskeyLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">ログイン</h1>
          <p className="mt-2 text-sm text-gray-600">
            パスキーまたはSMSでログインできます。
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white/80 p-6 shadow-sm backdrop-blur">

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
              <span className="text-sm font-medium text-gray-700">メールアドレス</span>
              <input
                ref={emailInputRef}
                type="email"
                inputMode="email"
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-invalid={!!error}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">パスワード</span>
              <input
                ref={passwordInputRef}
                type="password"
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
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
              className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-900 disabled:opacity-60"
              aria-disabled={submitting}
            >
              {submitting ? "ログイン中..." : "ログイン"}
            </button>

            <div className="space-y-2">
              <button
                type="button"
                onClick={onPasskeyLogin}
                disabled={passkeyLoading || !supportsPasskey}
                className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
              >
                {passkeyLoading ? "パスキー認証中..." : "パスキーでログイン"}
              </button>

              <Link 
                href="/login/sms" 
                className="block w-full rounded-lg border border-gray-200 px-4 py-2 text-center text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                📱 SMS認証でログイン
              </Link>
            </div>

            {!supportsPasskey && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                この端末はパスキーに対応していません。SMSをご利用ください。
              </p>
            )}

            <div className="text-center text-sm text-gray-600">
              アカウントをお持ちでない方は{" "}
              <Link href="/register" className="font-medium text-blue-600 hover:underline">
                新規登録
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
