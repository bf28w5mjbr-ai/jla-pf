import { Suspense } from "react";
import { cookies } from "next/headers";
import { verifySessionCached } from "@/lib/auth";
import { verifyDayOpsUnlockFromCookies } from "@/lib/dayOpsUnlockCookie";
import { getCompetitionPublicLightMeta } from "@/lib/competitionPublicPageLoader";
import CompetitionPublicPageTabs from "@/components/public/CompetitionPublicPageTabs";
import type { CompetitionPublicTabValue } from "@/lib/competitionPublicTab";
import { CompetitionPublicOverviewPanelLoader } from "./CompetitionPublicOverviewPanelLoader";
import { CompetitionPublicStartListPanelLoader } from "./CompetitionPublicStartListPanelLoader";
import {
  CompetitionPublicOverviewPanelSkeleton,
  CompetitionPublicStartListPanelSkeleton,
} from "./CompetitionPublicPageSkeleton";

type TabValue = CompetitionPublicTabValue;

type Props = {
  competitionId: string;
  activeTab: TabValue;
  detailBasePath: string;
};

export async function CompetitionPublicTabsLoader({
  competitionId,
  activeTab,
  detailBasePath,
}: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);
  const sessionUserId = session?.userId ?? null;
  const [hasDayOpsUnlock, competitionMeta] = await Promise.all([
    verifyDayOpsUnlockFromCookies(competitionId),
    getCompetitionPublicLightMeta(competitionId),
  ]);
  const dayOpsUnlockConfigured = Boolean(competitionMeta?.dayOpsAccessSecretHash);

  return (
    <div className="space-y-4">
      <CompetitionPublicPageTabs
        competitionId={competitionId}
        detailBasePath={detailBasePath}
        overview={
          activeTab === "overview" ? (
            <Suspense fallback={<CompetitionPublicOverviewPanelSkeleton />}>
              <CompetitionPublicOverviewPanelLoader
                competitionId={competitionId}
                sessionUserId={sessionUserId}
              />
            </Suspense>
          ) : null
        }
        results={
          activeTab === "results" ? (
            <Suspense fallback={<CompetitionPublicStartListPanelSkeleton />}>
              <CompetitionPublicStartListPanelLoader
                competitionId={competitionId}
                sessionUserId={sessionUserId}
                hasDayOpsUnlock={hasDayOpsUnlock}
                dayOpsUnlockConfigured={dayOpsUnlockConfigured}
              />
            </Suspense>
          ) : null
        }
      />
    </div>
  );
}
