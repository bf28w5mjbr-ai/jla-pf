import Link from "next/link";
import { HomeAboutSection } from "@/components/home/HomeAboutSection";
import { HomeClosingCtaSection } from "@/components/home/HomeClosingCtaSection";
import { HomeCompetitionsShowcase } from "@/components/home/HomeCompetitionsShowcase";
import { HomeClubsShowcase } from "@/components/home/HomeClubsShowcase";
import { HomeHeroSection } from "@/components/home/HomeHeroSection";
import { HomePlatformSection } from "@/components/home/HomePlatformSection";
import { Button } from "@/components/ui/button";
import type { HomeFeaturedClub, HomeFeaturedCompetition } from "@/lib/homeFeaturedContent";

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
      <HomeHeroSection />

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
