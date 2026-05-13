import type { ComponentProps } from "react";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  ClipboardList,
  ExternalLink,
  LayoutList,
  MapPin,
  PieChart,
  Settings2,
  UserCog,
} from "lucide-react";
import { getRequiredAuthenticatedUserId, verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CompetitionRelationsEditor from "@/components/CompetitionRelationsEditor";
import CompetitionAnnouncementsManager from "@/components/CompetitionAnnouncementsManager";
import CompetitionAttachmentsManager from "@/components/CompetitionAttachmentsManager";
import CompetitionGalleryManager from "@/components/CompetitionGalleryManager";
import CompetitionEntrySettingsEditor from "@/components/CompetitionEntrySettingsEditor";
import CompetitionParticipationConditionsEditor from "@/components/CompetitionParticipationConditionsEditor";
import CompetitionEntriesTabContent from "@/components/admin/CompetitionEntriesTabContent";
import CompetitionFinanceTabContent from "@/components/admin/CompetitionFinanceTabContent";
import CompetitionOfficialTabHeavy from "@/components/admin/CompetitionOfficialTabHeavy";
import CompetitionOfficialSubTabsClient from "@/components/admin/CompetitionOfficialSubTabsClient";
import CompetitionStatusToggleButton from "@/components/CompetitionStatusToggleButton";
import CompetitionBasicInfoEditor from "@/components/CompetitionBasicInfoEditor";
import CompetitionNameInlineEditor from "@/components/CompetitionNameInlineEditor";
import { loadCompetitionMutationState } from "@/lib/competitionPublishedEditRules";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  COMPETITION_ADMIN_DATE_TIME_ZONE,
  formatCompactJaDateRange,
  formatDateForDatetimeLocalInput,
} from "@/lib/datetimeLocal";
import { relationLogosWithDisplaySrc } from "@/lib/relationLogos";
import {
  parseOfficialSubTab,
  resolveCompetitionManagementActiveTab,
  type CompetitionManagementPageSearchParams,
  type CompetitionManagementTabValue,
} from "@/lib/competitionManagementTab";
import { getCompetitionManagementAccess } from "@/lib/competitionManagementAccess";
import CopyAbsoluteUrlButton from "@/components/public/CopyAbsoluteUrlButton";
import CompetitionManagementTabsClient from "@/components/admin/CompetitionManagementTabsClient";

type EntrySettingsEditorProps = ComponentProps<typeof CompetitionEntrySettingsEditor>;

/** 大会設定タブ用（お知らせ・添付・ギャラリー・種目・年齢区分など一式） */
function buildCompetitionManagementIncludeForPageTab(userId: string): Prisma.CompetitionInclude {
  return {
    organization: {
      include: {
        admins: {
          where: { userId },
        },
      },
    },
    technicalOfficialQualificationTemplate: {
      select: { id: true, name: true, kind: true },
    },
    announcements: {
      orderBy: { createdAt: "desc" },
    },
    attachments: {
      orderBy: { createdAt: "desc" },
    },
    galleryPhotos: {
      orderBy: { createdAt: "asc" },
    },
    events: {
      orderBy: { displayOrder: "asc" },
    },
    ageCategories: {
      orderBy: { displayOrder: "asc" },
    },
  };
}

/** オフィシャル / エントリー / 収支タブ用（ヘッダーと権限用の organization のみ + 種目件数） */
function buildCompetitionManagementIncludeForLightTab(userId: string): Prisma.CompetitionInclude {
  return {
    organization: {
      include: {
        admins: {
          where: { userId },
        },
      },
    },
    _count: {
      select: { events: true },
    },
  };
}

export const dynamic = "force-dynamic";

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
  const activeTab = resolveCompetitionManagementActiveTab(resolvedSearchParams);
  const officialSub = parseOfficialSubTab(resolvedSearchParams.officialSub);
  const userId = await getRequiredAuthenticatedUserId();

  const [access, competition, entryMutationState] = await Promise.all([
    getCompetitionManagementAccess(organizationId, competitionId, userId),
    activeTab === "page"
      ? prisma.competition.findUnique({
          where: { id: competitionId },
          include: buildCompetitionManagementIncludeForPageTab(userId),
        })
      : prisma.competition.findUnique({
          where: { id: competitionId },
          include: buildCompetitionManagementIncludeForLightTab(userId),
        }),
    loadCompetitionMutationState(competitionId),
  ]);

  if (!competition) {
    notFound();
  }
  if (access.kind === "not_found" || access.kind === "wrong_org") {
    notFound();
  }
  if (access.kind === "forbidden") {
    redirect(`/organizations/${organizationId}`);
  }

  const qualificationTemplates =
    activeTab === "page" || activeTab === "official"
      ? await prisma.qualificationTemplate.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true, kind: true },
        })
      : [];

  const canEdit = true;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "下書き";
      case "PUBLISHED":
        return "公開中";
      case "ONGOING":
        return "開催中";
      case "COMPLETED":
        return "終了";
      case "CANCELLED":
        return "中止";
      default:
        return status;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return "border-emerald-500/35 bg-emerald-500/[0.12] text-emerald-900 dark:text-emerald-100";
      case "DRAFT":
        return "border-border bg-muted/80 text-muted-foreground";
      case "ONGOING":
        return "border-primary/40 bg-primary/10 text-primary";
      case "COMPLETED":
        return "border-violet-500/35 bg-violet-500/[0.12] text-violet-900 dark:text-violet-100";
      case "CANCELLED":
        return "border-destructive/35 bg-destructive/10 text-destructive";
      default:
        return "border-border bg-muted text-muted-foreground";
    }
  };

  const dayOpsUnlockConfigured = Boolean(competition.dayOpsAccessSecretHash);

  const allowMultipleEventEntries = competition.allowMultipleEventEntries ?? true;
  const maxEventEntriesPerPerson =
    typeof competition.maxEventEntriesPerPerson === "number" &&
    competition.maxEventEntriesPerPerson > 0
      ? competition.maxEventEntriesPerPerson
      : null;

  const [entryRowCount, teamEntryRowCount, siblingCompetitionsForCopy] = await Promise.all([
    activeTab === "page"
      ? prisma.competitionEntry.count({ where: { competitionId } })
      : Promise.resolve(0),
    activeTab === "page"
      ? prisma.teamEntry.count({ where: { competitionId } })
      : Promise.resolve(0),
    activeTab === "page"
      ? prisma.competition.findMany({
          where: { organizationId, id: { not: competitionId } },
          orderBy: { startDate: "desc" },
          take: 40,
          select: { id: true, name: true, startDate: true },
        })
      : Promise.resolve([] as { id: string; name: string; startDate: Date }[]),
  ]);

  const copyEntrySettingsAllowed = entryRowCount === 0 && teamEntryRowCount === 0;
  const copyEntrySettingsBlockedReason = copyEntrySettingsAllowed
    ? null
    : "エントリーが1件でもある大会では、種目・参加費のコピーはできません。";

  const eventCount =
    activeTab === "page"
      ? (competition as { events: { length: number } }).events.length
      : (competition as { _count: { events: number } })._count.events;
  const showOfficialRecruitment = competition.officialRecruitmentEnabled ?? true;
  const showTechnicalOfficialRecruitment =
    showOfficialRecruitment && (competition.technicalOfficialRecruitmentEnabled ?? true);

  return (
    <div className="app-page mx-auto w-full min-w-0 max-w-6xl space-y-5 px-4 py-6 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <header className="space-y-4 border-b border-border/80 pb-6 sm:pb-7">
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link href={`/organizations/${organizationId}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            主催団体に戻る
          </Link>
        </Button>

        <div className="space-y-4">
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

          <div className="flex flex-wrap items-center gap-2">
            {competition.category ? (
              <Badge variant="secondary" className="font-normal">
                {competition.category}
              </Badge>
            ) : null}
            <Badge variant="outline" className="font-normal">
              大会種別:{" "}
              {competition.competitionType === "A"
                ? "A級"
                : competition.competitionType === "B"
                  ? "B級"
                  : "未付与"}
            </Badge>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium sm:text-sm",
                getStatusBadgeClass(competition.status)
              )}
            >
              {getStatusLabel(competition.status)}
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Calendar className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              {formatCompactJaDateRange(competition.startDate, competition.endDate)}
            </span>
            {competition.venue ? (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                <span className="truncate">{competition.venue}</span>
              </span>
            ) : null}
          </div>

          <p className="text-sm tabular-nums text-muted-foreground">
            種目 {eventCount}件
            {activeTab === "page" ? (
              <>
                {" "}
                · 個人エントリー {entryRowCount}件 · チーム {teamEntryRowCount}件
              </>
            ) : null}
          </p>

          {canEdit ? (
            <div className="flex flex-wrap gap-2" role="toolbar" aria-label="参加者向けページを別タブで開く">
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href={`/competitions/${competitionId}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 opacity-80" aria-hidden />
                  公開ページ
                </Link>
              </Button>
              <CopyAbsoluteUrlButton
                path={`/competitions/${competitionId}`}
                label="公開ページのリンクをコピー"
              />
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link
                  href={`/competitions/${competitionId}/start-list`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <LayoutList className="h-4 w-4 opacity-80" aria-hidden />
                  スタートリスト
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href={`/organizations/${organizationId}/competitions/${competitionId}/type-application`}>
                  大会種別申請
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <CompetitionManagementTabsClient activeTab={activeTab}>
        <div className="sticky top-[calc(var(--safe-area-top,0px)+2.75rem)] z-20 -mx-4 bg-transparent px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:top-2 lg:px-8">
          <TabsList
            className="grid h-auto w-full grid-cols-2 gap-1 bg-transparent p-0 sm:grid-cols-4"
            aria-label="大会管理のセクション"
          >
            <TabsTrigger
              value="page"
              className="gap-1.5 rounded-md border border-transparent bg-background/50 px-2 py-2.5 text-xs font-medium transition-colors hover:bg-background/70 data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3 sm:text-sm"
            >
              <Settings2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>大会設定</span>
            </TabsTrigger>
            <TabsTrigger
              value="official"
              className="gap-1.5 rounded-md border border-transparent bg-background/50 px-2 py-2.5 text-xs font-medium transition-colors hover:bg-background/70 data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3 sm:text-sm"
            >
              <UserCog className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>オフィシャル</span>
            </TabsTrigger>
            <TabsTrigger
              value="entries"
              className="gap-1.5 rounded-md border border-transparent bg-background/50 px-2 py-2.5 text-xs font-medium transition-colors hover:bg-background/70 data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3 sm:text-sm"
            >
              <ClipboardList className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>エントリー</span>
            </TabsTrigger>
            <TabsTrigger
              value="finance"
              className="gap-1.5 rounded-md border border-transparent bg-background/50 px-2 py-2.5 text-xs font-medium transition-colors hover:bg-background/70 data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3 sm:text-sm"
            >
              <PieChart className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>収支</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 大会設定タブ */}
        <TabsContent value="page" className="min-w-0 space-y-5 pt-4">
          {activeTab === "page" ? (
            <>
          <CompetitionBasicInfoEditor
            competitionId={competition.id}
            canEdit={canEdit}
            initialData={{
              name: competition.name,
              category: competition.category,
              startDate: competition.startDate.toISOString().slice(0, 10),
              endDate: competition.endDate.toISOString().slice(0, 10),
              entryStartDate: competition.entryStartDate
                ? formatDateForDatetimeLocalInput(competition.entryStartDate, {
                    timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
                  })
                : "",
              entryEndDate: competition.entryEndDate
                ? formatDateForDatetimeLocalInput(competition.entryEndDate, {
                    timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
                  })
                : "",
              venue: competition.venue,
              requireClubMembership: competition.requireClubMembership ?? false,
            }}
          />

          <CompetitionParticipationConditionsEditor
            competitionId={competitionId}
            canEdit={canEdit}
            isPublished={competition.isPublished}
            requiresParticipantNotice={
              entryMutationState.isPublished && entryMutationState.hasEstablishedEntry
            }
            settingsVersion={competition.updatedAt.toISOString()}
            initialData={{
              entryStartDate: competition.entryStartDate,
              entryEndDate: competition.entryEndDate,
              entryFee: competition.entryFee as unknown as NonNullable<
                EntrySettingsEditorProps["initialData"]
              >["entryFee"],
              requiredQualifications: competition.requiredQualifications as unknown,
              participantEligibilityText: competition.participantEligibilityText,
              allowMultipleEventEntries,
              maxEventEntriesPerPerson,
              requireClubMembership: competition.requireClubMembership ?? false,
              minAge: competition.minAge,
              maxAge: competition.maxAge,
              competitionCategory: competition.category,
              entryPledgeEnabled: competition.entryPledgeEnabled ?? false,
              entryPledgeText: competition.entryPledgeText,
              entryPledgeLockNoOffer: competition.entryPledgeLockNoOffer ?? false,
              underAgeSystemEnabled: competition.underAgeSystemEnabled ?? false,
              underAgeUThresholds: competition.underAgeUThresholds ?? [],
              underAgeOpenEnabled: competition.underAgeOpenEnabled ?? true,
            }}
            initialEvents={
              competition.events.map((e) => ({
                ...e,
                sex: e.sex as "MALE" | "FEMALE",
                minAge: e.minAge,
                maxAge: e.maxAge,
                ageCategoryId: e.ageCategoryId ?? null,
                createdAt: e.createdAt.toISOString(),
                updatedAt: e.updatedAt.toISOString(),
              })) as unknown as NonNullable<EntrySettingsEditorProps["initialEvents"]>
            }
            initialAgeCategories={competition.ageCategories.map((c) => ({
              id: c.id,
              name: c.name,
              displayOrder: c.displayOrder,
              eligibleBirthDateFrom: c.eligibleBirthDateFrom,
              eligibleBirthDateTo: c.eligibleBirthDateTo,
            }))}
            qualificationTemplates={qualificationTemplates.map((template) => ({
              id: template.id,
              name: template.name,
              kind: template.kind,
            }))}
          />

          <CompetitionEntrySettingsEditor
            competitionId={competitionId}
            canEdit={canEdit}
            isPublished={competition.isPublished}
            requiresParticipantNotice={
              entryMutationState.isPublished && entryMutationState.hasEstablishedEntry
            }
            settingsVersion={competition.updatedAt.toISOString()}
            siblingCompetitionsForCopy={siblingCompetitionsForCopy.map((c) => ({
              id: c.id,
              name: c.name,
              startDate: c.startDate.toISOString(),
            }))}
            copyEntrySettingsAllowed={copyEntrySettingsAllowed}
            copyEntrySettingsBlockedReason={copyEntrySettingsBlockedReason}
            initialStartListSettings={competition.startListSettings}
            initialData={{
              entryStartDate: competition.entryStartDate,
              entryEndDate: competition.entryEndDate,
              entryFee: competition.entryFee as unknown as NonNullable<
                EntrySettingsEditorProps["initialData"]
              >["entryFee"],
              requiredQualifications: competition.requiredQualifications as unknown,
              participantEligibilityText: competition.participantEligibilityText,
              allowMultipleEventEntries,
              maxEventEntriesPerPerson,
              requireClubMembership: competition.requireClubMembership ?? false,
              minAge: competition.minAge,
              maxAge: competition.maxAge,
              competitionCategory: competition.category,
              entryPledgeEnabled: competition.entryPledgeEnabled ?? false,
              entryPledgeText: competition.entryPledgeText,
              entryPledgeLockNoOffer: competition.entryPledgeLockNoOffer ?? false,
              underAgeSystemEnabled: competition.underAgeSystemEnabled ?? false,
              underAgeUThresholds: competition.underAgeUThresholds ?? [],
              underAgeOpenEnabled: competition.underAgeOpenEnabled ?? true,
            }}
            initialEvents={
              competition.events.map((e) => ({
                ...e,
                sex: e.sex as "MALE" | "FEMALE",
                minAge: e.minAge,
                maxAge: e.maxAge,
                ageCategoryId: e.ageCategoryId ?? null,
                createdAt: e.createdAt.toISOString(),
                updatedAt: e.updatedAt.toISOString(),
              })) as unknown as NonNullable<EntrySettingsEditorProps["initialEvents"]>
            }
            initialAgeCategories={competition.ageCategories.map((c) => ({
              id: c.id,
              name: c.name,
              displayOrder: c.displayOrder,
              eligibleBirthDateFrom: c.eligibleBirthDateFrom,
              eligibleBirthDateTo: c.eligibleBirthDateTo,
            }))}
            qualificationTemplates={qualificationTemplates.map((template) => ({
              id: template.id,
              name: template.name,
              kind: template.kind,
            }))}
          />

          {/* 大会説明 */}
          {competition.description && (
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border bg-muted/15 px-4 py-3">
                <CardTitle className="text-base font-semibold">大会について</CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{competition.description}</p>
              </CardContent>
            </Card>
          )}

          {/* 関係組織情報 */}
          <CompetitionRelationsEditor
            competitionId={competition.id}
            sponsors={competition.sponsors}
            cooperators={competition.cooperators}
            cooperatorsLogos={relationLogosWithDisplaySrc(competition.cooperatorsLogos)}
            supporters={competition.supporters}
            grants={competition.grants}
            grantsLogos={relationLogosWithDisplaySrc(competition.grantsLogos)}
            canEdit={canEdit}
          />

          {/* お知らせゾーン */}
          <CompetitionAnnouncementsManager
            competitionId={competitionId}
            initialAnnouncements={competition.announcements.map(a => ({
              ...a,
              createdAt: a.createdAt.toISOString(),
              updatedAt: a.updatedAt.toISOString(),
              publishedAt: a.publishedAt?.toISOString() || null,
            }))}
            canEdit={canEdit}
          />

          {/* 添付ファイルゾーン */}
          <CompetitionAttachmentsManager
            competitionId={competitionId}
            initialAttachments={competition.attachments.map(a => ({
              ...a,
              createdAt: a.createdAt.toISOString(),
            }))}
            canEdit={canEdit}
          />

          <CompetitionGalleryManager
            competitionId={competitionId}
            canEdit={canEdit}
            initialPhotos={competition.galleryPhotos.map((p) => ({
              id: p.id,
              imageUrl: p.imageUrl,
              fileName: p.fileName,
              createdAt: p.createdAt.toISOString(),
            }))}
          />
            </>
          ) : null}
        </TabsContent>

        {/* オフィシャル設定タブ */}
        <TabsContent value="official" className="min-w-0 space-y-4 pt-4">
          <CompetitionOfficialSubTabsClient officialSub={officialSub}>
            <>
              <Card className="overflow-hidden border-border/80">
                <CardHeader className="space-y-2 border-b border-border/70 bg-muted/20 px-4 py-3 sm:px-5">
                  <CardTitle className="text-base">オフィシャル管理</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    「管理」で募集の ON/OFF と資格・TO 人数、「当日運用」で暗号・応募・不足・出席をまとめます。上のサブタブは
                    URL に同期されます。
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 p-3 sm:p-4">
                  {activeTab === "official" ? (
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                      詳細ブロックは「管理」「当日運用」の下に表示されます（初回は数秒かかることがあります）。
                    </p>
                  ) : null}
                  <Suspense
                    fallback={
                      <div
                        className="flex min-h-[8rem] flex-col justify-center gap-2 rounded-lg border border-border/60 bg-muted/25 px-4 py-3"
                        role="status"
                        aria-live="polite"
                      >
                        <div
                          className="h-8 max-w-[12rem] animate-pulse rounded-md bg-muted-foreground/15"
                          aria-hidden
                        />
                        <p className="text-sm text-muted-foreground">
                          オフィシャル設定の詳細を読み込んでいます…
                        </p>
                      </div>
                    }
                  >
                    <CompetitionOfficialTabHeavy
                      enabled={activeTab === "official"}
                      officialSub={officialSub}
                      organizationId={organizationId}
                      competitionId={competitionId}
                      competitionName={competition.name}
                      showOfficialRecruitment={showOfficialRecruitment}
                      showTechnicalOfficialRecruitment={showTechnicalOfficialRecruitment}
                      canEdit={canEdit}
                      dayOpsUnlockConfigured={dayOpsUnlockConfigured}
                      officialQualificationFilterEnabled={
                        competition.officialQualificationFilterEnabled ?? false
                      }
                      requireClubMembership={competition.requireClubMembership ?? false}
                      initialTiers={competition.technicalOfficialTiers}
                      competitionType={competition.competitionType}
                      qualificationTemplates={qualificationTemplates}
                    />
                  </Suspense>
                </CardContent>
              </Card>

              {!showOfficialRecruitment ? (
                <Card className="border-dashed border-border/80 bg-muted/15">
                  <CardContent className="space-y-1 px-4 py-8 text-center text-sm text-muted-foreground">
                    <p>現在はオフィシャル募集がOFFです。</p>
                  </CardContent>
                </Card>
              ) : null}
            </>
          </CompetitionOfficialSubTabsClient>
        </TabsContent>

        <TabsContent value="entries" className="min-w-0 space-y-5 pt-4">
          {activeTab === "entries" ? (
            <CompetitionEntriesTabContent
              organizationId={organizationId}
              competitionId={competitionId}
              canEdit={canEdit}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="finance" className="min-w-0 space-y-5 pt-4">
          {activeTab === "finance" ? (
            <CompetitionFinanceTabContent
              organizationId={organizationId}
              competitionId={competitionId}
              canEdit={canEdit}
            />
          ) : null}
        </TabsContent>

      </CompetitionManagementTabsClient>
    </div>
  );
}
