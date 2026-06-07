import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeClubsShowcaseLoader } from "@/app/_components/home/HomeClubsShowcaseLoader";
import { HomeCompetitionsShowcaseLoader } from "@/app/_components/home/HomeCompetitionsShowcaseLoader";
import {
  HomeClubsShowcaseSkeleton,
  HomeCompetitionsShowcaseSkeleton,
} from "@/app/_components/home/HomeShowcaseSkeleton";
import { HomeLanding } from "@/components/HomeLanding";
import { HomeCoverSiteShell } from "@/components/public/HomeCoverSiteShell";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Bluvium",
  description:
    "開催予定のライフセービング大会とクラブを閲覧。ログイン後はエントリーから決済まで続けられるプラットフォーム",
};

export default function Home() {
  return (
    <HomeCoverSiteShell>
      <HomeLanding
        competitionsSection={
          <Suspense fallback={<HomeCompetitionsShowcaseSkeleton />}>
            <HomeCompetitionsShowcaseLoader />
          </Suspense>
        }
        clubsSection={
          <Suspense fallback={<HomeClubsShowcaseSkeleton />}>
            <HomeClubsShowcaseLoader />
          </Suspense>
        }
      />
    </HomeCoverSiteShell>
  );
}
