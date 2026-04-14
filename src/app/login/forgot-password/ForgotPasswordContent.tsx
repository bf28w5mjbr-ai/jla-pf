"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthPanel, AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { appendRedirectQuery, safePostLoginPath } from "@/lib/postLoginRedirect";

function ForgotPasswordInner() {
  const searchParams = useSearchParams();
  const redirectAfterLogin = safePostLoginPath(searchParams.get("redirect"));
  const [smsLoginAvailable, setSmsLoginAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then(async (r) => {
        const j = (await r.json()) as { smsLoginAvailable?: boolean };
        setSmsLoginAvailable(typeof j.smsLoginAvailable === "boolean" ? j.smsLoginAvailable : true);
      })
      .catch(() => setSmsLoginAvailable(true));
  }, []);

  const loginHref = appendRedirectQuery("/login", redirectAfterLogin);
  const smsHref = appendRedirectQuery("/login/sms", redirectAfterLogin);

  return (
    <AuthShell
      maxWidth="md"
      title="パスワードをお忘れの方へ"
      subtitle="メールでのパスワード再設定は行っていません。登録時に使えるログイン方法（パスキーなど）か、お問い合わせをご利用ください。"
      subtitleDensity="balanced"
    >
      <AuthPanel className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-4">
          <h2 className="text-sm font-semibold text-foreground">パスキーでログイン</h2>
          <p>
            パスキーを登録済みの場合、ログイン画面で<strong className="text-foreground">同じメールアドレス</strong>
            を入力してから「パスキーでログイン」を選ぶと、パスワードなしで入れます。
          </p>
          <Button className="w-full" asChild>
            <Link href={loginHref}>ログイン画面に戻る</Link>
          </Button>
        </section>

        <section className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-4">
          <h2 className="text-sm font-semibold text-foreground">SMS でログイン</h2>
          {smsLoginAvailable === null ? (
            <p className="text-muted-foreground">読み込み中…</p>
          ) : smsLoginAvailable ? (
            <>
              <p>
                この環境では SMS によるログインが有効です。登録のメールアドレス・お名前で本人確認し、登録済みの携帯番号へ届く認証コードでログインできます（パスワードは不要です）。
              </p>
              <Button variant="outline" className="w-full" asChild>
                <Link href={smsHref}>SMS 認証でログインする</Link>
              </Button>
            </>
          ) : (
            <p>
              この環境では<strong className="text-foreground"> SMS を使ったログインは提供していません</strong>
              （運用設定）。パスキーで入れるか、下記のお問い合わせをご利用ください。
            </p>
          )}
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
