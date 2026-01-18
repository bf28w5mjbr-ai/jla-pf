"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

function OTPLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const phone = searchParams.get("phone");

  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      toast.error("セッションが見つかりません");
      router.push("/login/sms");
    }
  }, [sessionId, router]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login/sms/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "認証に失敗しました");
        return;
      }

      toast.success("ログインしました");
      router.push("/dashboard");
    } catch (err) {
      console.error("OTP verify error:", err);
      toast.error("認証に失敗しました");
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>認証コード入力</CardTitle>
          <CardDescription>
            {phone ? `${phone} に送信された6桁の認証コードを入力してください` : "送信された6桁の認証コードを入力してください"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">認証コード</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                placeholder="123456"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^\d]/g, ''))}
                required
                className="text-center text-2xl tracking-widest"
              />
              <p className="text-xs text-muted-foreground">
                認証コードの有効期限は5分です
              </p>
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
        </CardContent>
      </Card>
    </div>
  );
}

export default function SMSLoginOTPPage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <OTPLoginContent />
    </Suspense>
  );
}
