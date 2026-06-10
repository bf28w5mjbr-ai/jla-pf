import { Suspense } from "react";
import { cookies } from "next/headers";
import { verifySessionCached } from "@/lib/auth";
import { verifyDayOpsUnlockFromCookies } from "@/lib/dayOpsUnlockCookie";
import { getCompetitionPublicLightMeta } from "@/lib/competitionPublicPageLoader";
import CompetitionPublicPageTabs from "@/components/public/CompetitionPublicPageTabs";
import { CompetitionSubheading } from "./competitionEditorialUi";
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
  layout?: "classic" | "editorial";
};

export async function CompetitionPublicTabsLoader({
  competitionId,
  activeTab,
  detailBasePath,
  layout = "classic",
}: Props) {
  const isEditorial = layout === "editorial";
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
    <div className={isEditorial ? "space-y-5" : "space-y-4"}>
      {isEditorial ? (
        <div className="mb-1">
          <CompetitionSubheading>Details</CompetitionSubheading>
        </div>
      ) : null}
      <CompetitionPublicPageTabs
        competitionId={competitionId}
        detailBasePath={detailBasePath}
        variant={isEditorial ? "editorial" : "classic"}
        overview={
          activeTab === "overview" ? (
            <Suspense fallback={<CompetitionPublicOverviewPanelSkeleton layout={layout} />}>
              <CompetitionPublicOverviewPanelLoader
                competitionId={competitionId}
                sessionUserId={sessionUserId}
                layout={layout}
              />
            </Suspense>
          ) : null
        }
        results={
          activeTab === "results" ? (
            <Suspense
              fallback={<CompetitionPublicStartListPanelSkeleton layout={layout} />}
            >
              <CompetitionPublicStartListPanelLoader
                competitionId={competitionId}
                sessionUserId={sessionUserId}
                hasDayOpsUnlock={hasDayOpsUnlock}
                dayOpsUnlockConfigured={dayOpsUnlockConfigured}
                layout={layout}
              />
            </Suspense>
          ) : null
        }
      />
    </div>
  );
}
