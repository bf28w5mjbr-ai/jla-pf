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

function SMSLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectAfterLogin = safePostLoginPath(searchParams.get("redirect"));
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [smsHeld, setSmsHeld] = useState(false);

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
            SMS送信を保留しているため、携帯番号への認証コード送信ができません。メールアドレスとパスワード、またはパスキーでログインしてください。
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
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMessage = data.error || "認証コード送信に失敗しました";
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      toast.success("認証コードを送信しました");
      const otpBase = `/login/sms/otp?sessionId=${data.sessionId}&phone=${encodeURIComponent(phoneNumber)}`;
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
      subtitle="登録済みの携帯電話番号でログインします。"
      subtitleDensity="balanced"
    >
      <AuthPanel>
        <AutofillSyncForm onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              className="rounded-lg border border-red-200/80 bg-red-50 px-3 py-2.5 dark:border-red-900/50 dark:bg-red-950/40"
              role="alert"
            >
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">携帯電話番号</Label>
            <Input
              id="phoneNumber"
              type="tel"
              numericInput="integer"
              placeholder="09012345678"
              maxLength={11}
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                if (error) setError(null);
              }}
              required
            />
            <p className="text-xs text-muted-foreground">ハイフンなし11桁で入力してください</p>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
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
