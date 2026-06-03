import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { HomeLanding } from "@/components/HomeLanding";
import { PublicSiteShellWrapper } from "@/components/public/PublicSiteShellWrapper";
import { redirectIfAuthenticated } from "@/lib/auth";
import { hostnameFromHeaders, isCoverPageHost } from "@/lib/coverPageHost";
import {
  loadHomeCompetitionCategories,
  loadHomeFeaturedClubs,
  loadHomeFeaturedCompetitions,
} from "@/lib/homeFeaturedContent";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Bluvium",
  description:
    "開催予定のライフセービング大会とクラブを閲覧。ログイン後はエントリーから決済まで続けられるプラットフォーム",
};

const COVER_PAGE_URL = "https://bluvium.jp/";

export default async function Home() {
  const headerList = await headers();
  if (isCoverPageHost(hostnameFromHeaders(headerList))) {
    await redirectIfAuthenticated(null);
    const [upcomingCompetitions, competitionCategories, featuredClubs] = await Promise.all([
      loadHomeFeaturedCompetitions(),
      loadHomeCompetitionCategories(),
      loadHomeFeaturedClubs(),
    ]);
    return (
      <PublicSiteShellWrapper variant="cover">
        <HomeLanding
          upcomingCompetitions={upcomingCompetitions}
          competitionCategories={competitionCategories}
          featuredClubs={featuredClubs}
        />
      </PublicSiteShellWrapper>
    );
  }
  redirect(COVER_PAGE_URL);
}
