// src/app/login/LoginForm.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { startAuthentication } from "@simplewebauthn/browser";
import { Eye, EyeOff } from "lucide-react";
import { fieldHintClass } from "@/lib/explanation";
import { AuthPanel, AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import { appendRedirectQuery, safePostLoginPath } from "@/lib/postLoginRedirect";
import {
  formatJaRemainingDuration,
  parseRetryAfterSeconds,
} from "@/lib/loginRetryCountdown";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectAfterLogin = safePostLoginPath(searchParams.get("redirect"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [supportsPasskey, setSupportsPasskey] = useState(true);
  const [smsLoginAvailable, setSmsLoginAvailable] = useState<boolean | null>(null);
  const [passwordRetryRemainingSec, setPasswordRetryRemainingSec] = useState<number | null>(null);
  const [passkeyRetryRemainingSec, setPasskeyRetryRemainingSec] = useState<number | null>(null);

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

  const passwordRateLimited = passwordRetryRemainingSec != null && passwordRetryRemainingSec > 0;
  const passkeyRateLimited = passkeyRetryRemainingSec != null && passkeyRetryRemainingSec > 0;

  useEffect(() => {
    if (!passwordRateLimited) return;
    const id = window.setInterval(() => {
      setPasswordRetryRemainingSec((s) => (s == null || s <= 1 ? null : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [passwordRateLimited]);

  useEffect(() => {
    if (!passkeyRateLimited) return;
    const id = window.setInterval(() => {
      setPasskeyRetryRemainingSec((s) => (s == null || s <= 1 ? null : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [passkeyRateLimited]);

  useEffect(() => {
    fetch("/api/health")
      .then(async (r) => {
        const j = (await r.json()) as { smsLoginAvailable?: boolean };
        if (typeof j.smsLoginAvailable === "boolean") {
          setSmsLoginAvailable(j.smsLoginAvailable);
        } else {
          setSmsLoginAvailable(true);
        }
      })
      .catch(() => setSmsLoginAvailable(true));
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
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          retryAfterSec?: unknown;
        };
        if (res.status === 429) {
          const sec = parseRetryAfterSeconds(res, data);
          if (sec != null) {
            setPasswordRetryRemainingSec(sec);
            setError(null);
            toast.error("ログイン試行の上限に達しました", {
              description: `再試行可能まであと ${formatJaRemainingDuration(sec)}`,
            });
            return;
          }
        }
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

      setPasswordRetryRemainingSec(null);
      setPasskeyRetryRemainingSec(null);
      toast.success("ログイン成功");
      router.replace(redirectAfterLogin ?? "/dashboard");
    } catch {
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

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      const msg = "パスキーでログインするにはメールアドレスを入力してください";
      setError(msg);
      toast.error("入力が必要です", { description: msg });
      emailInputRef.current?.focus();
      return;
    }

    setPasskeyLoading(true);
    setError(null);

    try {
      const optionsRes = await fetch("/api/passkeys/authentication/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const options = await optionsRes.json();

      if (!optionsRes.ok) {
        if (optionsRes.status === 429) {
          const sec = parseRetryAfterSeconds(optionsRes, options);
          if (sec != null) {
            setPasskeyRetryRemainingSec(sec);
            setError(null);
            toast.error("パスキー操作の上限に達しました", {
              description: `再試行可能まであと ${formatJaRemainingDuration(sec)}`,
            });
            return;
          }
        }
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

      setPasswordRetryRemainingSec(null);
      setPasskeyRetryRemainingSec(null);
      toast.success("パスキーでログインしました");
      router.replace(redirectAfterLogin ?? "/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "パスキー認証に失敗しました";
      setError(msg);
      toast.error("パスキー認証失敗", { description: msg });
    } finally {
      setPasskeyLoading(false);
    }
  }

  return (
    <AuthShell
      maxWidth="md"
      title="ログイン"
      subtitle={
        smsLoginAvailable === false
          ? "メールアドレスとパスワード、またはパスキーでログインできます。パスキーは同じメールアドレスを入力してから実行してください。"
          : "メールアドレスとパスワード、またはパスキー・SMSでログインできます。パスキーは同じメールアドレスを入力してから実行してください。"
      }
      subtitleDensity="balanced"
    >
      <AuthPanel>
        {passwordRateLimited && passwordRetryRemainingSec != null ? (
          <p
            role="status"
            aria-live="polite"
            className="mb-4 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
          >
            <span className="font-medium">ログイン試行の上限に達しています。</span>
            <span className="mt-1 block text-amber-900/95 dark:text-amber-100/90">
              再試行可能まであと{" "}
              <span className="font-mono text-base font-semibold tabular-nums tracking-tight text-foreground">
                {formatJaRemainingDuration(passwordRetryRemainingSec)}
              </span>
            </span>
          </p>
        ) : null}
        {passkeyRateLimited && passkeyRetryRemainingSec != null ? (
          <p
            role="status"
            aria-live="polite"
            className="mb-4 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
          >
            <span className="font-medium">パスキー認証の操作上限に達しています。</span>
            <span className="mt-1 block text-amber-900/95 dark:text-amber-100/90">
              再試行可能まであと{" "}
              <span className="font-mono text-base font-semibold tabular-nums tracking-tight text-foreground">
                {formatJaRemainingDuration(passkeyRetryRemainingSec)}
              </span>
            </span>
          </p>
        ) : null}
        {error && (
          <p
            ref={errorRef}
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            className="mb-4 rounded-lg border border-red-200/80 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </p>
        )}

        <AutofillSyncForm
          onSubmit={onSubmit}
          className="space-y-4"
          aria-busy={submitting}
        >
          <div className="space-y-1.5">
            <Label htmlFor="login-email">メールアドレス</Label>
            <Input
              ref={emailInputRef}
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-invalid={!!error}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password">パスワード</Label>
            <div className="relative">
              <Input
                ref={passwordInputRef}
                id="login-password"
                type={showPassword ? "text" : "password"}
                className="pr-10"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-invalid={!!error}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className={fieldHintClass("guided")}>
              {smsLoginAvailable === false
                ? "パスワードを忘れた場合はアカウント回復手段の整備までサポート窓口へお問い合わせください。"
                : "パスワードを忘れた場合は、下の「SMS認証でログイン」から登録済みの携帯番号でログインできます。"}
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || passwordRateLimited}
            aria-disabled={submitting || passwordRateLimited}
          >
            {submitting ? "ログイン中..." : "ログイン"}
          </Button>

          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={onPasskeyLogin}
              disabled={passkeyLoading || !supportsPasskey || passkeyRateLimited}
              className="w-full"
            >
              {passkeyLoading ? "パスキー認証中..." : "パスキーでログイン"}
            </Button>

            {smsLoginAvailable !== false && (
              <Button variant="outline" className="w-full" asChild>
                <Link href={appendRedirectQuery("/login/sms", redirectAfterLogin)}>
                  SMS認証でログイン
                </Link>
              </Button>
            )}
          </div>

          {!supportsPasskey && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {smsLoginAvailable === false
                ? "この端末はパスキーに対応していません。メールアドレスとパスワードでログインしてください。"
                : "この端末はパスキーに対応していません。SMSをご利用ください。"}
            </p>
          )}

          <p className="text-center text-sm text-muted-foreground">
            アカウントをお持ちでない方は{" "}
            <Button variant="link" className="h-auto p-0 align-baseline font-medium text-foreground" asChild>
              <Link href={appendRedirectQuery("/register", redirectAfterLogin)}>新規登録</Link>
            </Button>
          </p>
        </AutofillSyncForm>
      </AuthPanel>
    </AuthShell>
  );
}
