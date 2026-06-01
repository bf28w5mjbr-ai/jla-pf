// src/app/login/LoginForm.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { fieldHintClass } from "@/lib/explanation";
import { AuthPanel, AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import { appendRedirectQuery, safePostLoginPath } from "@/lib/postLoginRedirect";
import { resolvePostLoginPath } from "@/lib/postLoginPasskeyUpgrade";
import {
  formatJaRemainingDuration,
  parseRetryAfterSeconds,
} from "@/lib/loginRetryCountdown";
import {
  isPasskeyUserCancellation,
  runPasskeyLoginFlow,
  supportsPasskeyAutofill,
  type PasskeyLoginResult,
} from "@/lib/passkeyLoginClient";
import {
  markPassivePasskeyLoginAttempted,
  PASSIVE_PASSKEY_DELAY_MS,
  shouldAttemptPassivePasskeyLogin,
} from "@/lib/loginPasskeyEntryAttempt";
import { WebAuthnAbortService } from "@simplewebauthn/browser";

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
  const [passwordRetryRemainingSec, setPasswordRetryRemainingSec] = useState<number | null>(null);
  const [passkeyRetryRemainingSec, setPasskeyRetryRemainingSec] = useState<number | null>(null);
  const [passkeyAutoTrying, setPasskeyAutoTrying] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const passkeyButtonActiveRef = useRef(false);

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

  const handlePasskeyLoginSuccess = useCallback(() => {
    setPasswordRetryRemainingSec(null);
    setPasskeyRetryRemainingSec(null);
    toast.success("パスキーでログインしました");
    router.replace(
      resolvePostLoginPath({
        redirectAfterLogin,
        passkeyCredentialCount: 0,
        supportsPasskey,
        loginMethod: "passkey",
      })
    );
  }, [redirectAfterLogin, router, supportsPasskey]);

  const handlePasskeyLoginResult = useCallback(
    (result: PasskeyLoginResult, showToastOnError: boolean): boolean => {
      if (result.ok) {
        handlePasskeyLoginSuccess();
        return true;
      }
      if (result.kind === "rate_limited") {
        setPasskeyRetryRemainingSec(result.retryAfterSec);
        setError(null);
        if (showToastOnError) {
          toast.error("パスキー操作の上限に達しました", {
            description: `再試行可能まであと ${formatJaRemainingDuration(result.retryAfterSec)}`,
          });
        }
        return true;
      }
      if (showToastOnError) {
        setError(result.message);
        toast.error("パスキー認証失敗", { description: result.message });
      }
      return false;
    },
    [handlePasskeyLoginSuccess]
  );

  useEffect(() => {
    if (!supportsPasskey || passkeyRateLimited) return;

    let cancelled = false;
    let passiveTimer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      if (await supportsPasskeyAutofill()) {
        try {
          const result = await runPasskeyLoginFlow({ useBrowserAutofill: true });
          if (cancelled || passkeyButtonActiveRef.current) return;
          if (handlePasskeyLoginResult(result, false)) return;
        } catch (err) {
          if (cancelled || passkeyButtonActiveRef.current) return;
          if (!isPasskeyUserCancellation(err)) {
            console.error("Passkey autofill login error:", err);
          }
        }
      }

      passiveTimer = setTimeout(() => {
        void (async () => {
          if (cancelled || passkeyButtonActiveRef.current) return;
          if (
            !shouldAttemptPassivePasskeyLogin({
              supportsPasskey,
              passkeyRateLimited,
            })
          ) {
            return;
          }

          markPassivePasskeyLoginAttempted();
          WebAuthnAbortService.cancelCeremony();
          setPasskeyAutoTrying(true);

          try {
            const result = await runPasskeyLoginFlow({});
            if (cancelled || passkeyButtonActiveRef.current) return;
            if (!result.ok && result.kind === "error" && result.code !== "PASSKEY_NOT_REGISTERED") {
              console.warn("[login] passive passkey login failed:", result.message);
            }
            handlePasskeyLoginResult(result, false);
          } catch (err) {
            if (cancelled || passkeyButtonActiveRef.current) return;
            if (!isPasskeyUserCancellation(err)) {
              console.warn("[login] passive passkey login error:", err);
            }
          } finally {
            if (!cancelled) setPasskeyAutoTrying(false);
          }
        })();
      }, PASSIVE_PASSKEY_DELAY_MS);
    })();

    return () => {
      cancelled = true;
      if (passiveTimer !== undefined) clearTimeout(passiveTimer);
      WebAuthnAbortService.cancelCeremony();
      setPasskeyAutoTrying(false);
    };
  }, [supportsPasskey, passkeyRateLimited, handlePasskeyLoginResult]);

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
        credentials: "include",
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
      const data = (await res.json().catch(() => ({}))) as {
        passkeyCredentialCount?: unknown;
      };
      const passkeyCredentialCount =
        typeof data.passkeyCredentialCount === "number" && data.passkeyCredentialCount >= 0
          ? data.passkeyCredentialCount
          : 0;
      toast.success("ログイン成功");
      router.replace(
        resolvePostLoginPath({
          redirectAfterLogin,
          passkeyCredentialCount,
          supportsPasskey,
          loginMethod: "password",
        })
      );
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

    passkeyButtonActiveRef.current = true;
    WebAuthnAbortService.cancelCeremony();
    setPasskeyLoading(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      if (normalizedEmail) {
        const legacyResult = await runPasskeyLoginFlow({ email: normalizedEmail });
        if (legacyResult.ok || legacyResult.kind === "rate_limited") {
          handlePasskeyLoginResult(legacyResult, true);
          return;
        }
        if (legacyResult.message.includes("パスキーが登録されていません")) {
          const discoverableResult = await runPasskeyLoginFlow({});
          if (handlePasskeyLoginResult(discoverableResult, true)) return;
          setError(
            "このメールアドレス向けのパスキーが見つかりませんでした。セキュリティ設定からパスキーを再登録してください。"
          );
          return;
        }
        handlePasskeyLoginResult(legacyResult, true);
        return;
      }

      const result = await runPasskeyLoginFlow({});
      handlePasskeyLoginResult(result, true);
    } catch (err: unknown) {
      if (isPasskeyUserCancellation(err)) return;
      const msg = err instanceof Error ? err.message : "パスキー認証に失敗しました";
      setError(msg);
      toast.error("パスキー認証失敗", { description: msg });
    } finally {
      passkeyButtonActiveRef.current = false;
      setPasskeyLoading(false);
    }
  }

  return (
    <AuthShell
      maxWidth="md"
      title="ログイン"
      subtitle="端末にパスキーがある場合はログイン画面を開いたあと認証をお試しします。使えない・キャンセルした場合は、メールアドレスとパスワードでログインできます。"
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
        {passkeyAutoTrying ? (
          <p
            role="status"
            aria-live="polite"
            className="mb-4 text-sm text-muted-foreground"
          >
            端末のパスキーを確認しています…
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
              autoComplete="username webauthn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-invalid={!!error}
            />
            {supportsPasskey ? (
              <p className={fieldHintClass("guided")}>
                自動でうまくいかない場合は、メール欄をタップしてパスキーを選ぶか、メールアドレスを入力して「パスキーでログイン」を押してください。
              </p>
            ) : null}
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
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <p className={fieldHintClass("guided")}>
                パスワードを忘れた場合は案内ページからメールで再設定するか、パスキー・お問い合わせをご利用ください。
              </p>
              <Button variant="link" className="h-auto shrink-0 justify-start p-0 text-sm font-medium" asChild>
                <Link href={appendRedirectQuery("/login/forgot-password", redirectAfterLogin)}>
                  パスワードをお忘れの方
                </Link>
              </Button>
            </div>
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
          </div>

          {!supportsPasskey && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              この端末はパスキーに対応していません。メールアドレスとパスワードでログインしてください。
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
