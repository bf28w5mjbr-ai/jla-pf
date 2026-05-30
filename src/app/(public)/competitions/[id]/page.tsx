import { Suspense } from "react";
import { Metadata } from "next";
import { competitionMetadataTitleOnly } from "@/lib/competitionMetadata";
import { CompetitionPublicHeaderLoader } from "./_components/CompetitionPublicHeaderLoader";
import { CompetitionPublicTabsLoader } from "./_components/CompetitionPublicTabsLoader";
import {
  CompetitionPublicHeaderSkeleton,
  CompetitionPublicPageTabsSkeleton,
} from "./_components/CompetitionPublicPageSkeleton";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return competitionMetadataTitleOnly(id);
}

export default async function CompetitionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const requestedTab = tab ?? "overview";
  const activeTab =
    requestedTab === "overview" || requestedTab === "start-list" ? requestedTab : "overview";

  return (
    <div className="app-page mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
      <Suspense fallback={<CompetitionPublicHeaderSkeleton />}>
        <CompetitionPublicHeaderLoader competitionId={id} />
      </Suspense>
      <Suspense fallback={<CompetitionPublicPageTabsSkeleton competitionId={id} />}>
        <CompetitionPublicTabsLoader competitionId={id} activeTab={activeTab} />
      </Suspense>
    </div>
  );
}
