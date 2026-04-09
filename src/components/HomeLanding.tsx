import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { authShellMainClassName } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features = [
  {
    title: "会員・所属",
    body: "クラブへの参加や所属情報をアプリ上で管理できます。",
  },
  {
    title: "資格・大会",
    body: "資格情報や大会エントリーに必要な条件をまとめて扱えます。",
  },
  {
    title: "決済",
    body: "エントリー料などの支払いを安全に処理できます。",
  },
] as const;

export function HomeLanding() {
  return (
    <main className={cn(authShellMainClassName, "flex flex-col")}>
      <div className="relative z-[1] mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10 sm:py-14">
        <div className="mb-10 flex justify-center sm:mb-12">
          <div className="inline-flex items-center gap-3 rounded-2xl px-2 py-1.5">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-600 via-orange-700 to-orange-900 text-sm font-bold tracking-tight text-white shadow-md ring-1 ring-white/15 dark:from-orange-300 dark:via-orange-200 dark:to-orange-100 dark:text-orange-950 dark:ring-orange-950/10"
              aria-hidden
            >
              B
            </span>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              Bluvium
            </span>
          </div>
        </div>

        <header className="mb-10 text-center sm:mb-12">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            JLA PF
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            会員から大会まで、
            <br className="sm:hidden" />
            ひとつの場所で
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            会員・所属・資格・大会エントリー・決済を一気通貫で扱うプラットフォームです。
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/login">
                ログイン
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/register">新規登録</Link>
            </Button>
          </div>
        </header>

        <ul className="grid gap-4 sm:grid-cols-3">
          {features.map((item) => (
            <li
              key={item.title}
              className="rounded-2xl border border-border/90 bg-card/95 p-5 shadow-sm backdrop-blur-sm dark:border-border dark:bg-card/80"
            >
              <h2 className="text-sm font-semibold text-foreground">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </li>
          ))}
        </ul>

        <footer className="mt-auto pt-14 text-center text-xs text-muted-foreground">
          <p>日本ライフセービング協会向けの業務支援アプリです。</p>
        </footer>
      </div>
    </main>
  );
}
