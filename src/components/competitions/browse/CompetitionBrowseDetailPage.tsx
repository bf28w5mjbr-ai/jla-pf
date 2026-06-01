import { Suspense } from "react";
import type { CompetitionPublicTabValue } from "@/lib/competitionPublicTab";
import { CompetitionPublicHeaderLoader } from "./CompetitionPublicHeaderLoader";
import { CompetitionPublicTabsLoader } from "./CompetitionPublicTabsLoader";
import {
  CompetitionPublicHeaderSkeleton,
  CompetitionPublicPageTabsSkeleton,
} from "./CompetitionPublicPageSkeleton";

type Props = {
  competitionId: string;
  activeTab: CompetitionPublicTabValue;
  detailBasePath: string;
};

export function CompetitionBrowseDetailPage({
  competitionId,
  activeTab,
  detailBasePath,
}: Props) {
  return (
    <div className="app-page mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
      <Suspense fallback={<CompetitionPublicHeaderSkeleton />}>
        <CompetitionPublicHeaderLoader competitionId={competitionId} />
      </Suspense>
      <Suspense
        fallback={
          <CompetitionPublicPageTabsSkeleton
            competitionId={competitionId}
            detailBasePath={detailBasePath}
          />
        }
      >
        <CompetitionPublicTabsLoader
          competitionId={competitionId}
          activeTab={activeTab}
          detailBasePath={detailBasePath}
        />
      </Suspense>
    </div>
  );
}
