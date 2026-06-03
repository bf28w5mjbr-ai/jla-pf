import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appRoutes } from "@/lib/appRoutes";

export function HomeHeroSection() {
  const listHref = appRoutes.public.competitions();

  return (
    <section className="w-full pb-8 pt-3 md:mx-auto md:max-w-3xl md:px-4 md:py-14 lg:max-w-5xl lg:py-16">
      <div className="md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:items-start md:gap-10 lg:gap-12">
        <header className="order-2 max-w-2xl px-4 pt-5 md:order-1 md:max-w-none md:px-0 md:pt-2 lg:pt-4">
          <p className="home-hero-enter text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Lifesaving
          </p>
          <h1 className="home-hero-enter home-hero-enter-delay-1 mt-2 text-balance text-[1.75rem] font-semibold leading-[1.2] tracking-tight text-foreground min-[400px]:text-3xl sm:text-4xl lg:text-5xl">
            大会とクラブから、
            <span className="bg-gradient-to-br from-orange-600 via-orange-700 to-orange-950 bg-clip-text text-transparent dark:from-orange-200 dark:via-orange-100 dark:to-amber-50">
              はじめる。
            </span>
          </h1>
          <p className="home-hero-enter home-hero-enter-delay-1 mt-3 max-w-prose text-pretty text-[0.9375rem] leading-relaxed text-muted-foreground min-[400px]:mt-4 min-[400px]:text-base sm:text-lg">
            開催予定の大会を確認し、クラブを探せます。ログイン後はエントリーから決済まで続けられます。
          </p>
          <div className="home-hero-enter home-hero-enter-delay-2 mt-6 flex flex-col items-stretch gap-2.5 md:mt-8 md:flex-row md:items-center md:gap-3">
            <Button asChild size="lg" className="w-full md:w-auto">
              <Link href={listHref}>
                大会情報を見る
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full md:w-auto">
              <Link href={appRoutes.public.clubs()}>クラブを探す</Link>
            </Button>
          </div>
        </header>

        <div className="relative order-1 aspect-[7/5] w-full overflow-hidden md:order-2 md:aspect-[4/3] md:rounded-2xl">
          <Image
            src="/home-hero.png"
            alt="波に乗るサーファーとデジタルな海のイラスト"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 45vw"
            className="object-cover object-[88%_34%] md:object-[72%_40%]"
          />
        </div>
      </div>
    </section>
  );
}
