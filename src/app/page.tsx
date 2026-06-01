import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { HomeLanding } from "@/components/HomeLanding";
import { PublicSiteShellWrapper } from "@/components/public/PublicSiteShellWrapper";
import { redirectIfAuthenticated } from "@/lib/auth";
import { hostnameFromHeaders, isCoverPageHost } from "@/lib/coverPageHost";
import { loadHomeFeaturedCompetitions } from "@/lib/homeFeaturedContent";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Bluvium",
  description:
    "ライフセービングの大会情報・クラブ情報を閲覧でき、会員・所属・資格・エントリー・決済を一括で扱えるプラットフォーム",
};

const COVER_PAGE_URL = "https://bluvium.jp/";

export default async function Home() {
  const headerList = await headers();
  if (isCoverPageHost(hostnameFromHeaders(headerList))) {
    await redirectIfAuthenticated(null);
    const upcomingCompetitions = await loadHomeFeaturedCompetitions();
    return (
      <PublicSiteShellWrapper variant="cover">
        <HomeLanding upcomingCompetitions={upcomingCompetitions} />
      </PublicSiteShellWrapper>
    );
  }
  redirect(COVER_PAGE_URL);
}
