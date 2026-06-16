import { Suspense } from "react";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { loadClubDetailPageData } from "@/lib/clubDetailPageLoader";
import type { ClubDetailTabValue } from "@/lib/clubDetailTab";
import { dashboardSectionClassName } from "@/app/(authenticated)/dashboard/_components/dashboardLayout";
import { OrgSubheading } from "@/app/(authenticated)/organizations/[id]/_components/organizationEditorialUi";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Users } from "lucide-react";
import ClubDetailTabsClient from "@/components/ClubDetailTabsClient";
import { cn } from "@/lib/utils";
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
    <section
      className={cn(
        dashboardSectionClassName,
        "pb-16 pt-12 sm:pb-20 sm:pt-16"
      )}
    >
      <div className="mb-6">
        <OrgSubheading>Management</OrgSubheading>
        <h2 className="mt-1 text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          クラブ管理
        </h2>
      </div>

      <ClubDetailTabsClient activeTab={activeTab}>
        <div
          className={cn(
            "sticky top-[calc(var(--safe-area-top,0px)+2.75rem)] z-20 mb-5 rounded-2xl border border-border/55 bg-background/95 p-1.5 shadow-sm backdrop-blur-md",
            "supports-[backdrop-filter]:bg-background/80 sm:static sm:backdrop-blur-none"
          )}
        >
          <TabsList
            className="flex h-auto w-full items-stretch gap-1 overflow-x-auto bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="クラブ管理の区分"
          >
            <TabsTrigger
              value="members"
              className="min-w-[6.5rem] flex-1 gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs transition-colors hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:min-w-[7.5rem] sm:px-3 sm:py-2.5 sm:text-sm"
            >
              <Users className="size-3.5 shrink-0 opacity-80 sm:size-4" aria-hidden />
              <span>メンバー</span>
              <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {approvedMemberCount}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="competitions"
              className="min-w-[6.5rem] flex-1 gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs transition-colors hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:min-w-[7.5rem] sm:px-3 sm:py-2.5 sm:text-sm"
            >
              <Trophy className="size-3.5 shrink-0 opacity-80 sm:size-4" aria-hidden />
              <span>大会</span>
              <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                <Suspense fallback="…">
                  <ClubCompetitionTabBadgeCount clubId={clubId} clubName={club.name} />
                </Suspense>
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="members" className="space-y-4">
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

          {activeTab === "members" ? (
            <Suspense fallback={<ClubMembersTabSkeleton />}>
              <ClubMembersTabPanel clubId={club.id} currentUserId={userId} />
            </Suspense>
          ) : null}
        </TabsContent>

        {activeTab === "competitions" ? (
          <Suspense fallback={<ClubCompetitionsTabSkeleton />}>
            <ClubCompetitionsTabPanel clubId={clubId} clubName={club.name} isClubAdmin={isClubAdmin} />
          </Suspense>
        ) : null}
      </ClubDetailTabsClient>
    </section>
  );
}
