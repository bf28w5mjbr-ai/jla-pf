"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  AuthPanel,
  AuthShell,
  AuthShellBrandedFallback,
} from "@/components/auth/AuthShell";
import { appendRedirectQuery, safePostLoginPath } from "@/lib/postLoginRedirect";

function OTPLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const phone = searchParams.get("phone");
  const redirectAfterLogin = safePostLoginPath(searchParams.get("redirect"));

  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      toast.error("セッションが見つかりません");
      router.push(appendRedirectQuery("/login/sms", redirectAfterLogin));
    }
  }, [sessionId, router, redirectAfterLogin]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login/sms/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        const message = data.error || "認証に失敗しました";
        setError(message);
        toast.error(message);
        return;
      }

      toast.success("ログインしました");
      router.push(redirectAfterLogin ?? "/dashboard");
    } catch (err) {
      console.error("OTP verify error:", err);
      const message = "認証に失敗しました";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);

    try {
      const res = await fetch("/api/auth/login/sms/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone, resend: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.cooldown) {
          setCountdown(data.cooldown);
        }
        toast.error(data.error || "再送信に失敗しました");
        return;
      }

      toast.success("認証コードを再送信しました");
      setCountdown(60);
      setOtp("");
    } catch (err) {
      console.error("Resend error:", err);
      toast.error("再送信に失敗しました");
    } finally {
      setResending(false);
    }
  };

  if (!sessionId) {
    return null;
  }

  const subtitle =
    phone != null && phone !== ""
      ? `${phone} に送信された6桁の認証コードを入力してください`
      : "送信された6桁の認証コードを入力してください";

  return (
    <AuthShell maxWidth="md" title="認証コード入力" subtitle={subtitle} subtitleDensity="balanced">
      <AuthPanel>
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">認証コード</Label>
            <Input
              id="otp"
              type="text"
              numericInput="integer"
              pattern="\d{6}"
              placeholder="123456"
              maxLength={6}
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value);
                if (error) setError(null);
              }}
              required
              className="text-center text-2xl tracking-[0.35em]"
            />
            <p className="text-xs text-muted-foreground">認証コードの有効期限は5分です</p>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
            {loading ? "認証中..." : "ログイン"}
          </Button>

          <div className="text-center">
            <Button
              type="button"
              variant="ghost"
              onClick={handleResend}
              disabled={countdown > 0 || resending}
              className="text-sm"
            >
              {countdown > 0
                ? `再送信まで ${countdown}秒`
                : resending
                  ? "送信中..."
                  : "認証コードを再送信"}
            </Button>
          </div>
        </form>
      </AuthPanel>
    </AuthShell>
  );
}

function OTPLoginFallback() {
  return <AuthShellBrandedFallback message="読み込み中…" />;
}

export default function SMSLoginOTPPage() {
  return (
    <Suspense fallback={<OTPLoginFallback />}>
      <OTPLoginContent />
    </Suspense>
  );
}
