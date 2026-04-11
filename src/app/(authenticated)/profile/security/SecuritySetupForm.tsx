"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface SecuritySetupFormProps {
  currentEmail: string | null;
  hasPassword: boolean;
}

export default function SecuritySetupForm({ currentEmail, hasPassword }: SecuritySetupFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    email: currentEmail || "",
    password: "",
    confirmPassword: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); // エラーをクリア

    // バリデーション
    if (!currentEmail && !formData.email) {
      const errorMsg = "メールアドレスを入力してください";
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (!hasPassword) {
      if (!formData.password) {
        const errorMsg = "パスワードを入力してください";
        setError(errorMsg);
        toast.error(errorMsg);
        return;
      }
      if (formData.password.length < 8) {
        const errorMsg = "パスワードは8文字以上で設定してください";
        setError(errorMsg);
        toast.error(errorMsg);
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        const errorMsg = "パスワードが一致しません";
        setError(errorMsg);
        toast.error(errorMsg);
        return;
      }
    }

    setLoading(true);

    try {
      const payload = {
        email: !currentEmail ? formData.email : undefined,
        password: !hasPassword ? formData.password : undefined,
      };

      const res = await fetch("/api/user/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error || "設定に失敗しました";
        setError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      toast.success("セキュリティ設定を更新しました");
      router.push("/profile");
      router.refresh();
    } catch (err) {
      console.error("Security setup error:", err);
      const errorMsg = "設定に失敗しました";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const isComplete = !!currentEmail && hasPassword;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isComplete ? "セキュリティ設定完了" : "セキュリティ設定"}
        </CardTitle>
        <CardDescription>
          {isComplete 
            ? "セキュリティ設定は完了しています。必要に応じて更新できます。"
            : "電話番号が使えなくなった場合でもログインできるようになります"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isComplete && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-2">
                <span className="text-xl">❌</span>
                <p className="text-sm font-medium text-red-900">{error}</p>
              </div>
            </div>
          )}

            <div className="flex items-center gap-2">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-green-900">設定完了</p>
                <p className="text-sm text-green-700">
                  メールアドレスとパスワードでログイン可能です
                </p>
              </div>
            </div>
          </div>
        )}

        <AutofillSyncForm onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">
              メールアドレス {currentEmail && "(設定済み)"}
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={!!currentEmail}
              required={!currentEmail}
            />
            {currentEmail && (
              <p className="text-xs text-muted-foreground">
                現在: {currentEmail}
              </p>
            )}
          </div>

          {!hasPassword && (
            <>
              <div className="space-y-2">
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="8文字以上"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">パスワード（確認）</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="8文字以上"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                />
              </div>
            </>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={loading || isComplete}>
              {loading ? "設定中..." : isComplete ? "設定済み" : "設定を保存"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/profile")}
            >
              戻る
            </Button>
          </div>
        </AutofillSyncForm>
      </CardContent>
    </Card>
  );
}
