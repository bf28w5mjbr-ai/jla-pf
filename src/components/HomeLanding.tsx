import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BluviumWordmark } from "@/components/BluviumWordmark";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col">
      <section className="relative min-h-[min(52vh,28rem)] w-full overflow-hidden sm:min-h-[min(58vh,34rem)]">
        <Image
          src="/home-hero.png"
          alt="波に乗るサーファーとデジタルな海のイラスト"
          fill
          priority
          sizes="(max-width: 768px) 100vw, calc(100vw - 16rem)"
          className="object-cover object-[72%_center] sm:object-right"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/88 to-background/20 dark:from-background dark:via-background/92 dark:to-background/35"
          aria-hidden
        />
        <div className="relative z-[1] mx-auto flex w-full max-w-3xl flex-col px-4 py-10 sm:max-w-4xl sm:py-14 lg:max-w-5xl">
          <div className="mb-8 sm:mb-10">
            <div className="inline-flex items-center rounded-2xl px-2 py-1.5">
              <BluviumWordmark variant="hero" />
            </div>
          </div>

          <header className="max-w-xl">
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              会員から大会まで、
              <br className="sm:hidden" />
              ひとつの場所で
            </h1>
            <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
              会員・所属・資格・大会エントリー・決済を一気通貫で扱うプラットフォームです。
            </p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/browse/competitions">
                  大会情報を見る
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <Link href="/clubs">クラブを探す</Link>
              </Button>
            </div>
          </header>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-10 pt-8 sm:pb-14 sm:pt-10">
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
          <p className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-auto px-3 py-1 text-xs font-normal">
              <Link href="/business">事業者情報</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-auto px-3 py-1 text-xs font-normal">
              <Link href="/legal/tokushoho">特定商取引法に基づく表示</Link>
            </Button>
          </p>
        </footer>
      </div>
    </div>
  );
}
