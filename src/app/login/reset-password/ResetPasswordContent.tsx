"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AuthPanel, AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Eye, EyeOff } from "lucide-react";
import { appendRedirectQuery, safePostLoginPath } from "@/lib/postLoginRedirect";

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const redirectAfterLogin = safePostLoginPath(searchParams.get("redirect"));

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <AuthShell
        maxWidth="md"
        title="パスワード再設定"
        subtitle="リンクが不正か、コピーが欠けている可能性があります。"
        subtitleDensity="balanced"
      >
        <AuthPanel className="space-y-4 text-sm text-muted-foreground">
          <p>再設定用のリンクをメールから開き直すか、パスワード忘れの手続きを最初からやり直してください。</p>
          <Button className="w-full" asChild>
            <Link href={appendRedirectQuery("/login/forgot-password", redirectAfterLogin)}>
              パスワードをお忘れの方へ
            </Link>
          </Button>
        </AuthPanel>
      </AuthShell>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== passwordConfirm) {
      toast.error("パスワードが一致しません");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        toast.error(data.error ?? "パスワードの更新に失敗しました");
        return;
      }
      toast.success(data.message ?? "パスワードを更新しました");
      router.replace(appendRedirectQuery("/login", redirectAfterLogin));
    } catch {
      toast.error("通信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      maxWidth="md"
      title="新しいパスワードを設定"
      subtitle="メールのリンクからアクセスしています。有効期限は送信から1時間です。"
      subtitleDensity="balanced"
    >
      <AuthPanel>
        <AutofillSyncForm onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-password">新しいパスワード（8文字以上）</Label>
            <div className="relative">
              <Input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                className="pr-10"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reset-password-confirm">新しいパスワード（確認）</Label>
            <Input
              id="reset-password-confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "保存中…" : "パスワードを保存"}
          </Button>
        </AutofillSyncForm>
      </AuthPanel>
    </AuthShell>
  );
}

export function ResetPasswordContent() {
  return (
    <Suspense
      fallback={
        <AuthShell maxWidth="md" title="パスワード再設定" subtitle="読み込み中…" subtitleDensity="balanced">
          <AuthPanel>
            <p className="text-sm text-muted-foreground">読み込み中…</p>
          </AuthPanel>
        </AuthShell>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
