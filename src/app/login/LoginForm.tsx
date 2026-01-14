// src/app/login/LoginForm.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner"; // ★ ここを変更：ui/use-toast ではなく sonner から

export default function LoginForm() {
  const router = useRouter();

  // 入力値
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // UI状態
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // アクセシビリティ用参照
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // エラー発生時はアラートにフォーカス（スクリーンリーダーに即通知）
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // 入力の軽い正規化
    const normalizedEmail = email.trim().toLowerCase();
    const rawPassword = password; // パスワードはそのまま

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password: rawPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        const msg = data?.error ?? "Login failed";
        setError(msg);
        toast.error("Login failed", { description: msg }); // ★ Sonner の toast
        // 入力へフォーカス誘導（メールが空ならメール、そうでなければパス）
        if (!normalizedEmail) {
          emailInputRef.current?.focus();
        } else {
          passwordInputRef.current?.focus();
        }
        return;
      }

      toast.success("Welcome back"); // ★ 成功トースト
      router.replace("/dashboard");
    } catch (err: any) {
      const msg = err?.message ?? "Network error";
      setError(msg);
      toast.error("Network error", { description: msg });
      emailInputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-bold mb-6">Log in</h1>

      {/* アクセシビリティ通知（ライブリージョン） */}
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
          <span className="text-sm">Email</span>
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
          <span className="text-sm">Password</span>
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
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-xs opacity-70">
        * デモ用：ユーザーは Prisma Studio の <code>User</code> に作成し、
        <code>hashedPassword</code> は <code>bcryptjs</code> で生成したものを保存してください。
      </p>
    </main>
  );
}
