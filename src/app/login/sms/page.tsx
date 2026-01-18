"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import Link from "next/link";

export default function SMSLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login/sms/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "認証コード送信に失敗しました");
        return;
      }

      toast.success("認証コードを送信しました");
      router.push(`/login/sms/otp?sessionId=${data.sessionId}&phone=${encodeURIComponent(phoneNumber)}`);
    } catch (err) {
      console.error("SMS login start error:", err);
      toast.error("認証コード送信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>SMS認証ログイン</CardTitle>
          <CardDescription>
            登録済みの携帯電話番号でログイン
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">携帯電話番号</Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="09012345678"
                maxLength={11}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, ''))}
                required
              />
              <p className="text-xs text-muted-foreground">
                ハイフンなし11桁で入力してください
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "送信中..." : "認証コードを送信"}
            </Button>

            <div className="text-center space-y-2 text-sm">
              <Link href="/login" className="text-primary hover:underline block">
                メールアドレスでログイン
              </Link>
              <Link href="/register/sms" className="text-muted-foreground hover:underline block">
                アカウントをお持ちでない方
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
