import { Suspense } from "react";
import { cookies } from "next/headers";
import { verifySessionCached } from "@/lib/auth";
import { verifyDayOpsUnlockFromCookies } from "@/lib/dayOpsUnlockCookie";
import { prisma } from "@/server/db";
import CompetitionPublicPageTabs from "@/components/public/CompetitionPublicPageTabs";
import { CompetitionPublicOverviewPanelLoader } from "./CompetitionPublicOverviewPanelLoader";
import { CompetitionPublicStartListPanelLoader } from "./CompetitionPublicStartListPanelLoader";
import {
  CompetitionPublicOverviewPanelSkeleton,
  CompetitionPublicStartListPanelSkeleton,
} from "./CompetitionPublicPageSkeleton";
import { DayOpsUnlockBannerLazy } from "./competitionPublicDynamicClients";

type TabValue = "overview" | "start-list";

type Props = {
  competitionId: string;
  activeTab: TabValue;
};

export async function CompetitionPublicTabsLoader({ competitionId, activeTab }: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const [session, hasDayOpsUnlock, competitionMeta] = await Promise.all([
    verifySessionCached(token),
    verifyDayOpsUnlockFromCookies(competitionId),
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: { dayOpsAccessSecretHash: true },
    }),
  ]);
  const sessionUserId = session?.userId ?? null;
  const dayOpsUnlockConfigured = Boolean(competitionMeta?.dayOpsAccessSecretHash);

  return (
    <div className="space-y-4">
      <DayOpsUnlockBannerLazy
        competitionId={competitionId}
        passphraseConfigured={dayOpsUnlockConfigured}
        alreadyUnlocked={hasDayOpsUnlock}
      />
      <CompetitionPublicPageTabs
        competitionId={competitionId}
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
        startList={
          activeTab === "start-list" ? (
            <Suspense fallback={<CompetitionPublicStartListPanelSkeleton />}>
              <CompetitionPublicStartListPanelLoader
                competitionId={competitionId}
                sessionUserId={sessionUserId}
                hasDayOpsUnlock={hasDayOpsUnlock}
              />
            </Suspense>
          ) : null
        }
      />
    </div>
  );
}
