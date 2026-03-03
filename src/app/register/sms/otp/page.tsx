"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

function OTPVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const phone = searchParams.get("phone");
  
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      toast.error("セッションIDが見つかりません");
      router.push("/register/sms");
    }
  }, [sessionId, router]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/registration/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        const message = data.error || "認証に失敗しました";
        setError(message);
        toast.error(message);
        
        if (data.maxAttemptsReached) {
          setTimeout(() => router.push("/register/sms"), 2000);
        }
        return;
      }

      toast.success("登録が完了しました!");
      router.push("/dashboard");
    } catch (err) {
      console.error("OTP verification error:", err);
      const message = "認証に失敗しました";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!phone) {
      toast.error("電話番号が見つかりません");
      return;
    }

    setResending(true);

    try {
      const res = await fetch("/api/registration/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: phone,
          resend: true,
          // 他のフィールドはサーバー側で既存セッションから取得
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "再送信に失敗しました");
        if (data.cooldown) {
          setCooldown(data.cooldown);
        }
        return;
      }

      toast.success("認証コードを再送信しました");
      setCooldown(60); // 60秒のクールダウン
    } catch (err) {
      console.error("Resend error:", err);
      toast.error("再送信に失敗しました");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>SMS認証コード入力</CardTitle>
          <CardDescription>
            {phone || "携帯電話"}に送信された6桁のコードを入力してください
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
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/[^\d]/g, ''));
                  if (error) setError(null);
                }}
                required
                className="text-center text-2xl tracking-widest"
              />
              <p className="text-xs text-muted-foreground">有効期限: 5分</p>
              {error && (
                <p className="text-xs text-red-600" role="alert">
                  {error}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
              {loading ? "確認中..." : "認証する"}
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
              >
                {cooldown > 0 
                  ? `再送信（${cooldown}秒後に可能）` 
                  : resending 
                  ? "送信中..." 
                  : "コードを再送信"}
              </Button>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              コードが届かない場合は、迷惑メールフォルダを確認するか、<br />
              電話番号が正しいことを確認してください。
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OTPVerifyPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OTPVerifyContent />
    </Suspense>
  );
}
