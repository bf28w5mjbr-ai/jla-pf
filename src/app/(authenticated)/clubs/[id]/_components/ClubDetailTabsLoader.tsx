import { Suspense } from "react";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { loadClubDetailPageData } from "@/lib/clubDetailPageLoader";
import type { ClubDetailTabValue } from "@/lib/clubDetailTab";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Users } from "lucide-react";
import ClubDetailTabsClient from "@/components/ClubDetailTabsClient";
import {
  ClubActivitiesLazy,
  ClubAnnouncementsLazy,
} from "./clubDynamicClients";
import { ClubCompetitionTabBadgeCount } from "./ClubCompetitionSectionCount";
import { ClubCompetitionsTabPanel } from "./ClubCompetitionsTabPanel";
import { ClubCompetitionsTabSkeleton } from "./ClubCompetitionsTabSkeleton";
import { ClubMembersTabPanel } from "./ClubMembersTabPanel";
import { ClubMembersTabSkeleton } from "./ClubMembersTabSkeleton";

type Props = {
  clubId: string;
  activeTab: ClubDetailTabValue;
};

export async function ClubDetailTabsLoader({ clubId, activeTab }: Props) {
  const userId = await getRequiredAuthenticatedUserId();
  const { club, userMembership, approvedMemberCount, isClubAdmin } =
    await loadClubDetailPageData(clubId, userId);

  return (
    <div className="mt-3 space-y-4">
      <ClubDetailTabsClient activeTab={activeTab}>
        <div className="sticky top-[calc(var(--safe-area-top,0px)+2.75rem)] z-20 -mx-3 border-y border-border/60 bg-background/95 px-3 py-1 shadow-[0_10px_22px_-18px_rgba(0,0,0,0.45)] backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:static sm:mx-0 sm:rounded-lg sm:border sm:bg-muted/35 sm:px-1 sm:py-1 sm:shadow-none sm:backdrop-blur-none">
          <TabsList
            className="flex h-auto w-full items-stretch gap-0.5 overflow-x-auto bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1"
            aria-label="クラブ管理の区分"
          >
            <TabsTrigger
              value="members"
              className="min-w-[6.5rem] flex-1 gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-muted/60 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:min-w-[7.5rem] sm:gap-1.5 sm:rounded-lg sm:px-2 sm:py-2 sm:text-xs md:text-sm"
            >
              <Users className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              <span>メンバー</span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground data-[state=active]:bg-background">
                {approvedMemberCount}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="competitions"
              className="min-w-[6.5rem] flex-1 gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-muted/60 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:min-w-[7.5rem] sm:gap-1.5 sm:rounded-lg sm:px-2 sm:py-2 sm:text-xs md:text-sm"
            >
              <Trophy className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              <span>大会</span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground data-[state=active]:bg-background">
                <Suspense fallback="…">
                  <ClubCompetitionTabBadgeCount clubId={clubId} clubName={club.name} />
                </Suspense>
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="members" className="space-y-3 pt-1.5 sm:space-y-4 sm:pt-2">
          {userMembership ? (
            <ClubAnnouncementsLazy
              clubId={club.id}
              currentUserId={userId}
              currentUserRole={userMembership.role}
            />
          ) : null}

          {userMembership ? (
            <ClubActivitiesLazy
              clubId={club.id}
              currentUserId={userId}
              currentUserRole={userMembership.role}
            />
          ) : null}

          <div className="space-y-6">
            {activeTab === "members" ? (
              <Suspense fallback={<ClubMembersTabSkeleton />}>
                <ClubMembersTabPanel clubId={club.id} currentUserId={userId} />
              </Suspense>
            ) : null}
          </div>
        </TabsContent>

        {activeTab === "competitions" ? (
          <Suspense fallback={<ClubCompetitionsTabSkeleton />}>
            <ClubCompetitionsTabPanel clubId={clubId} clubName={club.name} isClubAdmin={isClubAdmin} />
          </Suspense>
        ) : null}
      </ClubDetailTabsClient>
    </div>
  );
}
