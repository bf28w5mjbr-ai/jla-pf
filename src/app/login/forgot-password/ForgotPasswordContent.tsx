"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AuthPanel, AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { appendRedirectQuery, safePostLoginPath } from "@/lib/postLoginRedirect";
import { parseRetryAfterSeconds, formatJaRemainingDuration } from "@/lib/loginRetryCountdown";

function ForgotPasswordInner() {
  const searchParams = useSearchParams();
  const redirectAfterLogin = safePostLoginPath(searchParams.get("redirect"));
  const [resendConfigured, setResendConfigured] = useState<boolean | null>(null);

  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetRateSec, setResetRateSec] = useState<number | null>(null);

  const resetRateLimited = resetRateSec != null && resetRateSec > 0;

  useEffect(() => {
    if (!resetRateLimited) return;
    const id = window.setInterval(() => {
      setResetRateSec((s) => (s == null || s <= 1 ? null : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resetRateLimited]);

  useEffect(() => {
    fetch("/api/health")
      .then(async (r) => {
        const j = (await r.json()) as { resendApiKeyConfigured?: boolean };
        setResendConfigured(
          typeof j.resendApiKeyConfigured === "boolean" ? j.resendApiKeyConfigured : false
        );
      })
      .catch(() => {
        setResendConfigured(false);
      });
  }, []);

  const loginHref = appendRedirectQuery("/login", redirectAfterLogin);

  const onRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail.trim().toLowerCase(),
          ...(redirectAfterLogin ? { redirect: redirectAfterLogin } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        code?: string;
        retryAfterSec?: unknown;
      };

      if (res.status === 429) {
        const sec = parseRetryAfterSeconds(res, data);
        if (sec != null) {
          setResetRateSec(sec);
          toast.error("しばらくお待ちください", {
            description: `再試行可能まであと ${formatJaRemainingDuration(sec)}`,
          });
          return;
        }
      }

      if (res.status === 404 && data.code === "EMAIL_NOT_REGISTERED") {
        setResetError(data.error ?? "このメールアドレスでは再設定できません。");
        toast.error("メールアドレスを確認してください", { description: data.error });
        return;
      }

      if (!res.ok) {
        const msg = data.error ?? "送信に失敗しました";
        setResetError(msg);
        toast.error(msg);
        return;
      }

      setResetDone(true);
      toast.success(data.message ?? "メールを送信しました");
    } catch {
      setResetError("通信に失敗しました");
      toast.error("通信に失敗しました");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <AuthShell
      maxWidth="md"
      title="パスワードをお忘れの方へ"
      subtitle="メールでパスワードを再設定するか、パスキー・お問い合わせをご利用ください。"
      subtitleDensity="balanced"
    >
      <AuthPanel className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-4">
          <h2 className="text-sm font-semibold text-foreground">メールでパスワードを再設定</h2>
          {resendConfigured === null ? (
            <p className="text-muted-foreground">読み込み中…</p>
          ) : resendConfigured === false ? (
            <p>
              この環境ではメール送信（Resend）が未設定のため、ここからの再設定メールは送れません。
              <Link href="/legal/tokushoho" className="font-medium text-foreground underline underline-offset-2">
                特定商取引法に基づく表示
              </Link>
              のお問い合わせ先へご連絡ください。
            </p>
          ) : resetDone ? (
            <p className="text-foreground">
              入力されたメールアドレス宛に、パスワード再設定用のリンクを送信しました。届かない場合は迷惑メールフォルダもご確認ください（有効期限は1時間です）。
            </p>
          ) : (
            <>
              <p>登録のメールアドレスを入力して送信すると、再設定用のリンクが記載されたメールが届きます。</p>
              {resetRateLimited && resetRateSec != null ? (
                <p role="status" className="text-sm text-amber-900 dark:text-amber-100">
                  しばらくしてから再度お試しください。再試行可能まであと{" "}
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {formatJaRemainingDuration(resetRateSec)}
                  </span>
                </p>
              ) : null}
              {resetError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200/80 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                >
                  <p>{resetError}</p>
                  {resetError.includes("お問い合わせ") ? (
                    <p className="mt-2">
                      <Link
                        href="/legal/tokushoho"
                        className="font-medium text-foreground underline underline-offset-2"
                      >
                        お問い合わせ先（特定商取引法に基づく表示）
                      </Link>
                    </p>
                  ) : null}
                </div>
              ) : null}
              <AutofillSyncForm onSubmit={onRequestReset} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-reset-email">メールアドレス</Label>
                  <Input
                    id="forgot-reset-email"
                    type="email"
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(e) => {
                      setResetEmail(e.target.value);
                      if (resetError) setResetError(null);
                    }}
                    required
                    disabled={resetLoading || resetRateLimited}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={resetLoading || resetRateLimited}>
                  {resetLoading ? "送信中…" : "再設定用メールを送信"}
                </Button>
              </AutofillSyncForm>
            </>
          )}
        </section>

        <section className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-4">
          <h2 className="text-sm font-semibold text-foreground">パスキーでログイン</h2>
          <p>
            パスキーを登録済みの場合、ログイン画面の「パスキーでログイン」から、パスワードなしで入れます。
          </p>
          <Button className="w-full" asChild>
            <Link href={loginHref}>ログイン画面に戻る</Link>
          </Button>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">それでも入れない場合</h2>
          <p>
            端末の制限や登録情報の不一致などで上記が使えない場合は、
            <Link href="/legal/tokushoho" className="font-medium text-foreground underline underline-offset-2">
              特定商取引法に基づく表示
            </Link>
            に記載のお問い合わせ先へご連絡ください。
          </p>
        </section>
      </AuthPanel>
    </AuthShell>
  );
}

export function ForgotPasswordContent() {
  return (
    <Suspense
      fallback={
        <AuthShell maxWidth="md" title="パスワードをお忘れの方へ" subtitle="読み込み中…" subtitleDensity="balanced">
          <AuthPanel>
            <p className="text-sm text-muted-foreground">読み込み中…</p>
          </AuthPanel>
        </AuthShell>
      }
    >
      <ForgotPasswordInner />
    </Suspense>
  );
}
