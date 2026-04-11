import type { ReactNode } from "react";
import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Mail,
  Settings,
  Shield,
  Smartphone,
  UserRound,
} from "lucide-react";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AccountDangerZone from "@/components/AccountDangerZone";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "設定 | Bluvium",
};

export const dynamic = "force-dynamic";

function sexLabel(sex: string): string {
  if (sex === "MALE") return "男性";
  if (sex === "FEMALE") return "女性";
  return "その他";
}

function SettingsNavRow({
  href,
  icon: Icon,
  title,
  description,
  className,
}: {
  href: string;
  icon: typeof Mail;
  title: string;
  description: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-card/60 px-4 py-3.5 shadow-sm transition",
        "hover:border-primary/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <Icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground"
        aria-hidden
      />
    </Link>
  );
}

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      familyName: true,
      givenName: true,
      familyNameKana: true,
      givenNameKana: true,
      phoneNumber: true,
      role: true,
      dateOfBirth: true,
      sex: true,
      postalCode: true,
      prefecture: true,
      city: true,
      addressLine1: true,
      addressLine2: true,
      jlaMemberNumber: true,
      profilePhotoUrl: true,
      createdAt: true,
    },
  });

  if (!user) redirect("/login");

  const isSecure = true;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="space-y-2 border-b border-border/80 pb-8">
        <div className="flex items-center gap-2 text-primary">
          <Settings className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-medium">アカウント</span>
        </div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          設定
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          セキュリティ・個人情報・危険な操作をまとめて管理できます。
        </p>
      </header>

      <div className="space-y-8">
        <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
          <CardHeader className="border-b border-border/80 bg-muted/25">
            <div className="flex flex-wrap items-center gap-2">
              <Shield className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
              <CardTitle className="text-lg">セキュリティ</CardTitle>
            </div>
            <CardDescription>ログイン方法と連絡先の確認・変更</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-5 sm:p-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-muted/20 p-4 sm:flex-row sm:items-start sm:gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                <CheckCircle2 className="h-7 w-7" strokeWidth={1.5} aria-hidden />
              </div>
              <div className="min-w-0 space-y-3">
                <h2 className="text-base font-semibold text-foreground">アカウントは保護されています</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  メールアドレスとパスワードが設定済みです。電話番号が使えなくなってもアカウントにアクセスできます。
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="secondary"
                    className="border border-emerald-200/80 bg-emerald-50 font-normal text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    メールアドレス
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="border border-emerald-200/80 bg-emerald-50 font-normal text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    パスワード
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <SettingsNavRow
                href="/profile/security"
                icon={Mail}
                title="メールアドレスとパスワード"
                description="ログインに使うメール・パスワードの確認と変更"
              />
              <SettingsNavRow
                href="/profile/phone-change"
                icon={Smartphone}
                title="電話番号の変更"
                description={
                  <span className="font-mono text-[11px] text-muted-foreground sm:text-xs">
                    現在: {user.phoneNumber}
                  </span>
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
          <CardHeader className="flex flex-col gap-4 border-b border-border/80 bg-muted/25 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <UserRound className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                <CardTitle className="text-lg">個人情報</CardTitle>
              </div>
              <CardDescription>登録されている氏名・住所・連絡先</CardDescription>
            </div>
            <Button size="sm" className="shrink-0 gap-1.5" asChild>
              <Link href="/settings/edit-profile">
                編集する
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <dl className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                <dt className="text-xs font-medium text-muted-foreground">氏名</dt>
                <dd className="mt-1.5 text-sm font-medium text-foreground">
                  {user.familyName} {user.givenName}
                </dd>
                <dd className="mt-1 text-sm text-muted-foreground">
                  {user.familyNameKana} {user.givenNameKana}
                </dd>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                <dt className="text-xs font-medium text-muted-foreground">生年月日</dt>
                <dd className="mt-1.5 text-sm font-medium text-foreground">
                  {new Date(user.dateOfBirth).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                <dt className="text-xs font-medium text-muted-foreground">性別</dt>
                <dd className="mt-1.5 text-sm font-medium text-foreground">{sexLabel(user.sex)}</dd>
              </div>
              {user.jlaMemberNumber ? (
                <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                  <dt className="text-xs font-medium text-muted-foreground">JLA会員番号</dt>
                  <dd className="mt-1.5 font-mono text-sm font-medium text-foreground">
                    {user.jlaMemberNumber}
                  </dd>
                </div>
              ) : null}

              <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                <dt className="text-xs font-medium text-muted-foreground">メールアドレス</dt>
                <dd className="mt-1.5 break-all text-sm font-medium text-foreground">{user.email}</dd>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                <dt className="text-xs font-medium text-muted-foreground">電話番号</dt>
                <dd className="mt-1.5 font-mono text-sm font-medium text-foreground">{user.phoneNumber}</dd>
              </div>

              {user.postalCode ? (
                <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                  <dt className="text-xs font-medium text-muted-foreground">郵便番号</dt>
                  <dd className="mt-1.5 font-mono text-sm font-medium text-foreground">〒{user.postalCode}</dd>
                </div>
              ) : null}
              {user.prefecture || user.city || user.addressLine1 ? (
                <div className="rounded-xl border border-border/60 bg-muted/15 p-4 md:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">住所</dt>
                  <dd className="mt-1.5 text-sm font-medium leading-relaxed text-foreground">
                    {user.prefecture}
                    {user.city}
                    {user.addressLine1}
                    {user.addressLine2 ? (
                      <>
                        <br />
                        {user.addressLine2}
                      </>
                    ) : null}
                  </dd>
                </div>
              ) : null}

              <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                <dt className="text-xs font-medium text-muted-foreground">ユーザーID</dt>
                <dd className="mt-1.5 break-all rounded-lg bg-muted/50 px-2 py-1.5 font-mono text-xs text-foreground">
                  {user.id}
                </dd>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                <dt className="text-xs font-medium text-muted-foreground">登録日</dt>
                <dd className="mt-1.5 text-sm font-medium text-foreground">
                  {new Date(user.createdAt).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {isSecure ? <AccountDangerZone /> : null}
      </div>
    </div>
  );
}
