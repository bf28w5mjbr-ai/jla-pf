import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BluviumWordmark } from "@/components/BluviumWordmark";
import { HomeAboutSection } from "@/components/home/HomeAboutSection";
import { HomeClosingCtaSection } from "@/components/home/HomeClosingCtaSection";
import { HomeCompetitionsShowcase } from "@/components/home/HomeCompetitionsShowcase";
import { HomeClubsShowcase } from "@/components/home/HomeClubsShowcase";
import { HomePlatformSection } from "@/components/home/HomePlatformSection";
import { Button } from "@/components/ui/button";
import type { HomeFeaturedClub, HomeFeaturedCompetition } from "@/lib/homeFeaturedContent";
import { appRoutes } from "@/lib/appRoutes";

type Props = {
  upcomingCompetitions: HomeFeaturedCompetition[];
  competitionCategories: string[];
  featuredClubs: HomeFeaturedClub[];
};

export function HomeLanding({
  upcomingCompetitions,
  competitionCategories,
  featuredClubs,
}: Props) {
  return (
    <div className="flex flex-col">
      <section className="relative w-full overflow-hidden">
        <div className="relative aspect-[16/10] max-h-[min(70vh,42rem)] w-full sm:aspect-[16/9] sm:max-h-[min(72vh,44rem)]">
          <Image
            src="/home-hero.png"
            alt="波に乗るサーファーとデジタルな海のイラスト"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center sm:object-[60%_center]"
          />
          <div className="absolute inset-0 z-[1] flex items-center justify-center px-4">
            <BluviumWordmark
              variant="hero"
              className="sm:text-[2.15rem] [filter:drop-shadow(0_1px_2px_rgba(255,255,255,0.9))_drop-shadow(0_4px_20px_rgba(255,255,255,0.55))] dark:[filter:drop-shadow(0_2px_8px_rgba(0,0,0,0.45))_drop-shadow(0_4px_24px_rgba(0,0,0,0.35))]"
            />
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[min(52%,14rem)] bg-gradient-to-t from-background from-35% via-background/85 via-65% to-transparent sm:h-[min(48%,16rem)]"
            aria-hidden
          />
        </div>

        <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-8 sm:max-w-4xl sm:pb-8 sm:pt-10 lg:max-w-5xl">
          <header className="max-w-2xl">
            <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-[2.35rem]">
              大会とクラブから、はじめる。
            </h1>
            <p className="mt-4 max-w-prose text-pretty text-base text-muted-foreground sm:text-lg">
              開催予定の大会を確認し、クラブを探せます。ログイン後はエントリーから決済まで続けられます。
            </p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={appRoutes.public.competitions()}>
                  大会情報を見る
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <Link href={appRoutes.public.clubs()}>クラブを探す</Link>
              </Button>
            </div>
          </header>
        </div>
      </section>

      <HomeCompetitionsShowcase
        competitions={upcomingCompetitions}
        categories={competitionCategories}
      />

      <HomeAboutSection />

      <HomePlatformSection />

      <HomeClubsShowcase clubs={featuredClubs} />

      <HomeClosingCtaSection />

      <footer className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 text-center text-xs text-muted-foreground sm:max-w-4xl sm:pb-14 lg:max-w-5xl">
        <p className="flex flex-wrap items-center justify-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-auto px-3 py-1 text-xs font-normal"
          >
            <Link href="/business">事業者情報</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-auto px-3 py-1 text-xs font-normal"
          >
            <Link href="/legal/tokushoho">特定商取引法に基づく表示</Link>
          </Button>
        </p>
      </footer>
    </div>
  );
}
