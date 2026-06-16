import { Suspense } from "react";
import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  ExternalLink,
  Settings2,
  UserCog,
} from "lucide-react";
import { dashboardSectionClassName } from "@/app/(authenticated)/dashboard/_components/dashboardLayout";
import {
  OrgEditorialPanel,
  OrgSubheading,
} from "../../_components/organizationEditorialUi";
import { getRequiredAuthenticatedUserId, verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Badge } from "@/components/ui/badge";
import { TabsContent, TabsList } from "@/components/ui/tabs";
import CompetitionStatusToggleButton from "@/components/CompetitionStatusToggleButton";
import CompetitionNameInlineEditor from "@/components/CompetitionNameInlineEditor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  parseOfficialSubTab,
  resolveCompetitionManagementActiveTab,
  type CompetitionManagementPageSearchParams,
  type CompetitionManagementTabValue,
} from "@/lib/competitionManagementTab";
import { getCompetitionManagementAccess } from "@/lib/competitionManagementAccess";
import { appRoutes } from "@/lib/appRoutes";
import { buildCompetitionHeroSelect } from "@/lib/competitionManagementQueries";
import CompetitionManagementTabsClient, {
  CompetitionManagementTabTrigger,
} from "@/components/admin/CompetitionManagementTabsClient";
import {
  competitionStatusBadgeClassName,
  getCompetitionStatusLabel,
  getCompetitionTypeLabel,
} from "./_components/competitionManagementUi";

export const dynamic = "force-dynamic";

function TabPanelSkeleton({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-[10rem] flex-col justify-center gap-2 rounded-xl border border-border/60 bg-muted/25 px-4 py-6"
      role="status"
      aria-live="polite"
    >
      <div className="h-8 max-w-[14rem] animate-pulse rounded-md bg-muted-foreground/15" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

async function CompetitionManagementActiveTabPanel({
  activeTab,
  organizationId,
  competitionId,
  userId,
  officialSub,
}: {
  activeTab: CompetitionManagementTabValue;
  organizationId: string;
  competitionId: string;
  userId: string;
  officialSub: ReturnType<typeof parseOfficialSubTab>;
}) {
  if (activeTab === "page") {
    const { default: CompetitionManagementPageTab } = await import(
      "./_components/CompetitionManagementPageTab"
    );
    return (
      <CompetitionManagementPageTab
        organizationId={organizationId}
        competitionId={competitionId}
        userId={userId}
      />
    );
  }

  if (activeTab === "official") {
    const { default: CompetitionManagementOfficialTab } = await import(
      "./_components/CompetitionManagementOfficialTab"
    );
    return (
      <CompetitionManagementOfficialTab
        organizationId={organizationId}
        competitionId={competitionId}
        userId={userId}
        officialSub={officialSub}
      />
    );
  }

  const { default: CompetitionManagementEntriesTab } = await import(
    "./_components/CompetitionManagementEntriesTab"
  );
  return (
    <CompetitionManagementEntriesTab
      organizationId={organizationId}
      competitionId={competitionId}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; competitionId: string }>;
}): Promise<Metadata> {
  const { id: organizationId, competitionId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);
  const genericTitle = { title: "大会 | Bluvium" };
  if (!session?.userId) {
    return genericTitle;
  }

  const access = await getCompetitionManagementAccess(
    organizationId,
    competitionId,
    session.userId
  );
  if (access.kind !== "ok") {
    return genericTitle;
  }

  return {
    title: `${access.name || "大会"} | Bluvium`,
  };
}

export default async function CompetitionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; competitionId: string }>;
  searchParams: Promise<CompetitionManagementPageSearchParams>;
}) {
  const { id: organizationId, competitionId } = await params;
  const resolvedSearchParams = await searchParams;
  const rawTab = Array.isArray(resolvedSearchParams.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams.tab;
  if (typeof rawTab === "string" && rawTab.trim().toLowerCase() === "finance") {
    redirect(
      `/organizations/${organizationId}?tab=business&financeCompetition=${competitionId}`
    );
  }
  const activeTab = resolveCompetitionManagementActiveTab(resolvedSearchParams);
  const officialSub = parseOfficialSubTab(resolvedSearchParams.officialSub);
  const userId = await getRequiredAuthenticatedUserId();

  const access = await getCompetitionManagementAccess(organizationId, competitionId, userId);
  if (access.kind === "not_found" || access.kind === "wrong_org") {
    notFound();
  }
  if (access.kind === "forbidden") {
    redirect(`/organizations/${organizationId}`);
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: buildCompetitionHeroSelect(userId),
  });
  if (!competition) {
    notFound();
  }

  const canEdit = true;
  const organization = competition.organization;
  const competitionTypeLabel = getCompetitionTypeLabel(competition.competitionType);

  const tabSkeletonLabel =
    activeTab === "page"
      ? "大会設定を読み込んでいます…"
      : activeTab === "official"
        ? "オフィシャル設定を読み込んでいます…"
        : "エントリー情報を読み込んでいます…";

  return (
    <div className="flex flex-col">
      <section
        className={cn(
          dashboardSectionClassName,
          "border-b border-border/40 pb-0 pt-10 sm:pt-12"
        )}
      >
        <Link
          href={`/organizations/${organizationId}`}
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-full border border-transparent px-2 py-1.5 text-sm text-muted-foreground",
            "transition-colors hover:border-border/60 hover:bg-muted/30 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        >
          <ArrowLeft
            className="size-4 transition-transform group-hover:-translate-x-0.5"
            aria-hidden
          />
          主催団体に戻る
        </Link>
      </section>

      <section
        className={cn(
          dashboardSectionClassName,
          "border-b border-border/40 pb-12 pt-8 sm:pb-16 sm:pt-10"
        )}
      >
        <OrgEditorialPanel accent="orange">
          <OrgSubheading>Competition</OrgSubheading>
          {organization.name ? (
            <p className="mt-1 text-sm tracking-wide text-muted-foreground">{organization.name}</p>
          ) : null}

          <div className="mt-4">
            <CompetitionNameInlineEditor
              competitionId={competition.id}
              canEdit={canEdit}
              initialData={{
                name: competition.name,
                category: competition.category,
                startDate: competition.startDate.toISOString().slice(0, 10),
                endDate: competition.endDate.toISOString().slice(0, 10),
                venue: competition.venue,
              }}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {competition.category ? (
              <Badge variant="secondary" className="font-normal">
                {competition.category}
              </Badge>
            ) : null}
            <Badge variant="outline" className="font-normal">
              大会種別: {competitionTypeLabel}
            </Badge>
            <span className={competitionStatusBadgeClassName(competition.status)}>
              {getCompetitionStatusLabel(competition.status)}
            </span>
            {canEdit ? (
              <CompetitionStatusToggleButton
                competitionId={competitionId}
                status={competition.status}
                canEdit={canEdit}
                className="w-auto shrink-0"
              />
            ) : null}
          </div>

          {canEdit ? (
            <div
              className="mt-5 flex flex-wrap gap-2 border-t border-border/45 pt-5"
              role="toolbar"
              aria-label="大会の関連リンク"
            >
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link
                  href={appRoutes.public.competitionView(competitionId)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-4 opacity-80" aria-hidden />
                  公開ページ
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link
                  href={`/organizations/${organizationId}/competitions/${competitionId}/type-application`}
                >
                  大会種別申請
                </Link>
              </Button>
            </div>
          ) : null}
          {canEdit ? (
            <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
              スタートリスト全体の公開／非公開は、「公開ページ」のスタートリストタブから切り替えられます（大会単位で、全種目共通です）。
            </p>
          ) : null}
        </OrgEditorialPanel>
      </section>

      <section
        className={cn(
          dashboardSectionClassName,
          "pb-16 pt-12 sm:pb-20 sm:pt-16"
        )}
      >
        <div className="mb-6">
          <OrgSubheading>Management</OrgSubheading>
          <h2 className="mt-1 text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            大会管理
          </h2>
        </div>

        <CompetitionManagementTabsClient activeTab={activeTab}>
          <div
            className={cn(
              "sticky top-[calc(var(--safe-area-top,0px)+2.75rem)] z-20 mb-5 rounded-2xl border border-border/55 bg-background/95 p-1.5 shadow-sm backdrop-blur-md",
              "supports-[backdrop-filter]:bg-background/80 sm:static sm:backdrop-blur-none"
            )}
          >
            <TabsList
              className="flex h-auto w-full items-stretch gap-1 overflow-x-auto bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="大会管理のセクション"
            >
              <CompetitionManagementTabTrigger
                value="page"
                prefetchOnHover
                className="min-w-[7rem] flex-1 gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs transition-colors hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:min-w-[8rem] sm:px-3 sm:py-2.5 sm:text-sm"
              >
                <Settings2 className="size-3.5 shrink-0 opacity-80 sm:size-4" aria-hidden />
                <span>大会設定</span>
              </CompetitionManagementTabTrigger>
              <CompetitionManagementTabTrigger
                value="official"
                className="min-w-[7rem] flex-1 gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs transition-colors hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:min-w-[8rem] sm:px-3 sm:py-2.5 sm:text-sm"
              >
                <UserCog className="size-3.5 shrink-0 opacity-80 sm:size-4" aria-hidden />
                <span>オフィシャル</span>
              </CompetitionManagementTabTrigger>
              <CompetitionManagementTabTrigger
                value="entries"
                prefetchOnHover
                className="min-w-[7rem] flex-1 gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs transition-colors hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:min-w-[8rem] sm:px-3 sm:py-2.5 sm:text-sm"
              >
                <ClipboardList className="size-3.5 shrink-0 opacity-80 sm:size-4" aria-hidden />
                <span>エントリー</span>
              </CompetitionManagementTabTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="min-w-0">
            <Suspense fallback={<TabPanelSkeleton label={tabSkeletonLabel} />}>
              <CompetitionManagementActiveTabPanel
                activeTab={activeTab}
                organizationId={organizationId}
                competitionId={competitionId}
                userId={userId}
                officialSub={officialSub}
              />
            </Suspense>
          </TabsContent>
        </CompetitionManagementTabsClient>
      </section>
    </div>
  );
}
