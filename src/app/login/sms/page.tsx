"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Link from "next/link";
import { AuthPanel, AuthShell } from "@/components/auth/AuthShell";
import { appendRedirectQuery, safePostLoginPath } from "@/lib/postLoginRedirect";
import {
  formatJaRemainingDuration,
  parseRetryAfterSeconds,
} from "@/lib/loginRetryCountdown";

function SMSLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectAfterLogin = safePostLoginPath(searchParams.get("redirect"));
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [givenName, setGivenName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [smsHeld, setSmsHeld] = useState(false);
  const [smsRateRetryRemainingSec, setSmsRateRetryRemainingSec] = useState<number | null>(null);

  const smsRateLimited = smsRateRetryRemainingSec != null && smsRateRetryRemainingSec > 0;

  useEffect(() => {
    if (!smsRateLimited) return;
    const id = window.setInterval(() => {
      setSmsRateRetryRemainingSec((s) => (s == null || s <= 1 ? null : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [smsRateLimited]);

  useEffect(() => {
    fetch("/api/health")
      .then(async (r) => {
        const j = (await r.json()) as { smsLoginAvailable?: boolean };
        setSmsHeld(j.smsLoginAvailable === false);
      })
      .catch(() => setSmsHeld(false));
  }, []);

  if (smsHeld) {
    return (
      <AuthShell
        maxWidth="md"
        title="SMS認証ログイン"
        subtitle="現在、この方法でのログインはご利用いただけません。"
        subtitleDensity="balanced"
      >
        <AuthPanel>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            SMS送信を保留しているため、登録電話番号への認証コード送信ができません。メールアドレスとパスワード、またはパスキーでログインしてください。
          </p>
          <Button className="w-full" asChild>
            <Link href={appendRedirectQuery("/login", redirectAfterLogin)}>ログイン画面へ</Link>
          </Button>
        </AuthPanel>
      </AuthShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login/sms/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          familyName: familyName.trim(),
          givenName: givenName.trim(),
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        retryAfterSec?: unknown;
        sessionId?: string;
      };

      if (!res.ok) {
        if (res.status === 429) {
          const sec = parseRetryAfterSeconds(res, data);
          if (sec != null) {
            setSmsRateRetryRemainingSec(sec);
            setError(null);
            toast.error("SMS送信の上限に達しました", {
              description: `再試行可能まであと ${formatJaRemainingDuration(sec)}`,
            });
            return;
          }
        }
        const errorMessage = data.error || "認証コード送信に失敗しました";
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      const sessionId = data.sessionId;
      if (typeof sessionId !== "string" || !sessionId.trim()) {
        const errorMessage = "セッションの開始に失敗しました。もう一度お試しください。";
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      toast.success("認証コードを送信しました");
      const otpBase = `/login/sms/otp?sessionId=${encodeURIComponent(sessionId)}`;
      router.push(appendRedirectQuery(otpBase, redirectAfterLogin));
    } catch (err) {
      console.error("SMS login start error:", err);
      const errorMessage = "認証コード送信に失敗しました";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      maxWidth="md"
      title="SMS認証ログイン"
      subtitle="登録のメールアドレス・お名前で本人確認し、登録済みの電話番号へ認証コードを送ります。"
      subtitleDensity="balanced"
    >
      <AuthPanel>
        <AutofillSyncForm onSubmit={handleSubmit} className="space-y-4">
          {smsRateLimited && smsRateRetryRemainingSec != null ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
            >
              <p className="font-medium">SMS 送信が一時的に制限されています。</p>
              <p className="mt-1 text-amber-900/95 dark:text-amber-100/90">
                再試行可能まであと{" "}
                <span className="font-mono text-base font-semibold tabular-nums tracking-tight text-foreground">
                  {formatJaRemainingDuration(smsRateRetryRemainingSec)}
                </span>
              </p>
            </div>
          ) : null}
          {error && (
            <div
              className="rounded-lg border border-red-200/80 bg-red-50 px-3 py-2.5 dark:border-red-900/50 dark:bg-red-950/40"
              role="alert"
            >
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="familyName">姓</Label>
              <Input
                id="familyName"
                autoComplete="family-name"
                value={familyName}
                onChange={(e) => {
                  setFamilyName(e.target.value);
                  if (error) setError(null);
                }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="givenName">名</Label>
              <Input
                id="givenName"
                autoComplete="given-name"
                value={givenName}
                onChange={(e) => {
                  setGivenName(e.target.value);
                  if (error) setError(null);
                }}
                required
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            入力内容は登録時のプロフィール（漢字の氏名）と一致させてください。
          </p>

          <Button type="submit" className="w-full" disabled={loading || smsRateLimited}>
            {loading ? "送信中..." : "認証コードを送信"}
          </Button>

          <div className="space-y-2 text-center text-sm">
            <Button variant="outline" className="w-full" asChild>
              <Link href={appendRedirectQuery("/login", redirectAfterLogin)}>メールアドレスでログイン</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href={appendRedirectQuery("/register", redirectAfterLogin)}>アカウントをお持ちでない方</Link>
            </Button>
          </div>
        </AutofillSyncForm>
      </AuthPanel>
    </AuthShell>
  );
}

function SMSLoginFallback() {
  return (
    <AuthShell maxWidth="md" title="SMS認証ログイン" subtitle="読み込み中…" subtitleDensity="balanced">
      <AuthPanel>
        <p className="text-sm text-muted-foreground">読み込み中…</p>
      </AuthPanel>
    </AuthShell>
  );
}

export default function SMSLoginPage() {
  return (
    <Suspense fallback={<SMSLoginFallback />}>
      <SMSLoginContent />
    </Suspense>
  );
}
