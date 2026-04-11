import type { ComponentProps } from "react";
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
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CompetitionRelationsEditor from "@/components/CompetitionRelationsEditor";
import CompetitionAnnouncementsManager from "@/components/CompetitionAnnouncementsManager";
import CompetitionAttachmentsManager from "@/components/CompetitionAttachmentsManager";
import CompetitionGalleryManager from "@/components/CompetitionGalleryManager";
import CompetitionEntrySettingsEditor from "@/components/CompetitionEntrySettingsEditor";
import { OfficialSettingsEditor } from "@/components/OfficialSettingsEditor";
import CompetitionEntriesTabContent from "@/components/admin/CompetitionEntriesTabContent";
import CompetitionFinanceTabContent from "@/components/admin/CompetitionFinanceTabContent";
import TechnicalOfficialShortagePanel from "@/components/TechnicalOfficialShortagePanel";
import TechnicalOfficialSettingsEditor from "@/components/TechnicalOfficialSettingsEditor";
import OfficialAttendanceSection from "@/components/OfficialAttendanceSection";
import CompetitionStatusToggleButton from "@/components/CompetitionStatusToggleButton";
import CompetitionBasicInfoEditor from "@/components/CompetitionBasicInfoEditor";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { loadCompetitionMutationState } from "@/lib/competitionPublishedEditRules";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCompactJaDateRange } from "@/lib/datetimeLocal";
import {
  parseCompetitionManagementTab,
} from "@/lib/competitionManagementTab";
import { getPublicAppUrl } from "@/lib/appBaseUrl";
import CopyAbsoluteUrlButton from "@/components/public/CopyAbsoluteUrlButton";
import { listTechnicalOfficialShortagesForCompetition } from "@/lib/technicalOfficialQueries";
import CompetitionManagementTabsClient from "@/components/admin/CompetitionManagementTabsClient";
import { OfficialRecruitmentToggleButton } from "@/components/OfficialRecruitmentToggleButton";
import { TechnicalOfficialRecruitmentToggleButton } from "@/components/TechnicalOfficialRecruitmentToggleButton";
import OfficialApplicationsCsvExportButton, {
  type OfficialApplicationsCsvRow,
} from "@/components/OfficialApplicationsCsvExportButton";
import OfficialAttendancesCsvExportButton, {
  type OfficialAttendancesCsvRow,
} from "@/components/OfficialAttendancesCsvExportButton";
import CompetitionDayOpsPassphraseEditor from "@/components/CompetitionDayOpsPassphraseEditor";

type EntrySettingsEditorProps = ComponentProps<typeof CompetitionEntrySettingsEditor>;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; competitionId: string }>;
}): Promise<Metadata> {
  const { competitionId } = await params;
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { name: true },
  });

  return {
    title: `${competition?.name || "大会"} | Bluvium`,
  };
}

export default async function CompetitionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; competitionId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id: organizationId, competitionId } = await params;
  const { tab: tabParam } = await searchParams;
  const activeTab = parseCompetitionManagementTab(tabParam);
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (!session?.userId) {
    redirect("/login");
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      organization: {
        include: {
          admins: {
            where: { userId: session.userId },
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
      officialApplications: {
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              familyName: true,
              givenName: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      },
      officialAttendances: {
        orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
        include: {
          user: {
            select: {
              familyName: true,
              givenName: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      },
    },
  });

  if (!competition) {
    notFound();
  }

  const [qualificationTemplates, shortageRows] = await Promise.all([
    prisma.qualificationTemplate.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true },
    }),
    listTechnicalOfficialShortagesForCompetition(prisma, competitionId),
  ]);

  // 大会が指定された団体に属していることを確認
  if (competition.organizationId !== organizationId) {
    notFound();
  }

  if (!hasOrgAdminAccess(competition.organization.admins)) {
    redirect(`/organizations/${organizationId}`);
  }

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

  const entryMutationState = await loadCompetitionMutationState(competitionId);

  const [entryRowCount, teamEntryRowCount, siblingCompetitionsForCopy] = await Promise.all([
    prisma.competitionEntry.count({ where: { competitionId } }),
    prisma.teamEntry.count({ where: { competitionId } }),
    prisma.competition.findMany({
      where: { organizationId, id: { not: competitionId } },
      orderBy: { startDate: "desc" },
      take: 40,
      select: { id: true, name: true, startDate: true },
    }),
  ]);

  const copyEntrySettingsAllowed = entryRowCount === 0 && teamEntryRowCount === 0;
  const copyEntrySettingsBlockedReason = copyEntrySettingsAllowed
    ? null
    : "エントリーが1件でもある大会では、種目・参加費のコピーはできません。";

  const eventCount = competition.events.length;
  const showOfficialRecruitment = competition.officialRecruitmentEnabled ?? true;
  const showTechnicalOfficialRecruitment =
    showOfficialRecruitment && (competition.technicalOfficialRecruitmentEnabled ?? true);
  const officialStatusLabel = {
    PENDING: "審査中",
    APPROVED: "承認",
    REJECTED: "却下",
  } as const;
  const officialApplicationsCsvRows: OfficialApplicationsCsvRow[] = competition.officialApplications.map(
    (application) => ({
      応募日時: application.createdAt.toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      審査状態: officialStatusLabel[application.status] ?? application.status,
      氏名: `${application.user.familyName} ${application.user.givenName}`,
      メールアドレス: application.user.email ?? "",
      電話番号: application.user.phoneNumber ?? "",
      希望ポジション: application.positionName,
      応募メッセージ: application.message?.trim() || "",
    })
  );
  const competitionTypeLabel =
    competition.competitionType === "A"
      ? "A級"
      : competition.competitionType === "B"
        ? "B級"
        : "未設定";
  const attendanceCountAdditionLabel =
    competition.competitionType === "A"
      ? "1.0"
      : competition.competitionType === "B"
        ? "0.5"
        : "0.0";
  const officialAttendancesCsvRows: OfficialAttendancesCsvRow[] = competition.officialAttendances.map(
    (attendance) => ({
      出席日: attendance.attendanceDate.toLocaleDateString("ja-JP"),
      氏名: `${attendance.user.familyName} ${attendance.user.givenName}`,
      メールアドレス: attendance.user.email ?? "",
      電話番号: attendance.user.phoneNumber ?? "",
      出席方法: attendance.method === "NFC" ? "NFC" : "手動",
      大会種別: competitionTypeLabel,
      カウント追加分: attendanceCountAdditionLabel,
    })
  );
  const officialPendingCount = competition.officialApplications.filter(
    (application) => application.status === "PENDING"
  ).length;
  const officialApprovedCount = competition.officialApplications.filter(
    (application) => application.status === "APPROVED"
  ).length;
  const officialRejectedCount = competition.officialApplications.filter(
    (application) => application.status === "REJECTED"
  ).length;
  const officialAttendanceCount = competition.officialAttendances.length;

  const publicCompetitionPageUrl = `${getPublicAppUrl().replace(/\/$/, "")}/competitions/${competitionId}`;

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
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {competition.name}
          </h1>

          {competition.nameKana ? (
            <p className="text-sm text-muted-foreground">{competition.nameKana}</p>
          ) : null}

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
            種目 {eventCount}件 · 個人エントリー {entryRowCount}件 · チーム {teamEntryRowCount}件
          </p>

          {canEdit ? (
            <div className="flex flex-wrap gap-2" role="toolbar" aria-label="参加者向けページを別タブで開く">
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href={`/competitions/${competitionId}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 opacity-80" aria-hidden />
                  公開ページ
                </Link>
              </Button>
              <CopyAbsoluteUrlButton url={publicCompetitionPageUrl} label="公開URLをコピー" />
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
        <div className="sticky top-[max(0.25rem,var(--safe-area-top,0px))] z-20 -mx-4 mb-0.5 border-b border-border/60 bg-background/95 px-4 pb-2.5 pt-1 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <TabsList
            className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:grid-cols-4"
            aria-label="大会管理のセクション"
          >
            <TabsTrigger
              value="page"
              className="gap-1.5 rounded-md px-2 py-2.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3 sm:text-sm"
            >
              <Settings2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>大会設定</span>
            </TabsTrigger>
            <TabsTrigger
              value="official"
              className="gap-1.5 rounded-md px-2 py-2.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3 sm:text-sm"
            >
              <UserCog className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>オフィシャル</span>
            </TabsTrigger>
            <TabsTrigger
              value="entries"
              className="gap-1.5 rounded-md px-2 py-2.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3 sm:text-sm"
            >
              <ClipboardList className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>エントリー</span>
            </TabsTrigger>
            <TabsTrigger
              value="finance"
              className="gap-1.5 rounded-md px-2 py-2.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3 sm:text-sm"
            >
              <PieChart className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>収支</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 大会設定タブ */}
        <TabsContent value="page" className="min-w-0 space-y-5 pt-4">
          <CompetitionBasicInfoEditor
            competitionId={competition.id}
            canEdit={canEdit}
            initialData={{
              name: competition.name,
              nameKana: competition.nameKana,
              category: competition.category,
              startDate: competition.startDate.toISOString().slice(0, 10),
              endDate: competition.endDate.toISOString().slice(0, 10),
              venue: competition.venue,
              venueAddress: competition.venueAddress,
            }}
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
            cooperatorsLogos={
              competition.cooperatorsLogos as unknown as { name: string; logoUrl: string }[] | null
            }
            supporters={competition.supporters}
            grants={competition.grants}
            grantsLogos={
              competition.grantsLogos as unknown as { name: string; logoUrl: string }[] | null
            }
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
        </TabsContent>

        {/* オフィシャル設定タブ */}
        <TabsContent value="official" className="min-w-0 space-y-4 pt-4">
          <Card className="overflow-hidden border-border/80">
            <CardHeader className="space-y-2 border-b border-border/70 bg-muted/20 px-4 py-3 sm:px-5">
              <CardTitle className="text-base">オフィシャル管理</CardTitle>
              <p className="text-xs text-muted-foreground">
                募集設定、テクニカルオフィシャル要件、当日出席の記録、当日運用アクセス暗号をこのタブで行います。
              </p>
            </CardHeader>
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">オフィシャル募集</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        大会ページからのオフィシャル応募を許可します。
                      </p>
                    </div>
                    <OfficialRecruitmentToggleButton
                      organizationId={organizationId}
                      competitionId={competitionId}
                      initialEnabled={showOfficialRecruitment}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">TO募集</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        テクニカルオフィシャル募集と必要人数計算を有効化します。
                      </p>
                    </div>
                    <TechnicalOfficialRecruitmentToggleButton
                      organizationId={organizationId}
                      competitionId={competitionId}
                      initialEnabled={competition.technicalOfficialRecruitmentEnabled ?? true}
                      disabled={!showOfficialRecruitment}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={showOfficialRecruitment ? "default" : "secondary"}>
                  オフィシャル募集: {showOfficialRecruitment ? "ON" : "OFF"}
                </Badge>
                <Badge variant={showTechnicalOfficialRecruitment ? "default" : "secondary"}>
                  TO募集: {showTechnicalOfficialRecruitment ? "ON" : "OFF"}
                </Badge>
                <Badge variant="outline">応募(審査中): {officialPendingCount}件</Badge>
                <Badge variant="outline">応募(承認): {officialApprovedCount}件</Badge>
                <Badge variant="outline">応募(却下): {officialRejectedCount}件</Badge>
                <Badge variant="outline">出席実績: {officialAttendanceCount}件</Badge>
              </div>
            </CardContent>
          </Card>

          {showOfficialRecruitment ? (
            <section className="space-y-4">
              <CompetitionDayOpsPassphraseEditor
                organizationId={organizationId}
                competitionId={competitionId}
                canEdit={canEdit}
                initiallyConfigured={dayOpsUnlockConfigured}
              />

              <section className="space-y-3 rounded-xl border border-border/70 bg-background p-3 sm:p-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-foreground">
                    1. オフィシャル資格要件・TO設定
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    応募資格フィルタ、資格テンプレート、クラブごとのTO必要人数を設定します。
                  </p>
                </div>
                <OfficialSettingsEditor
                  competitionId={competitionId}
                  organizationId={organizationId}
                  initialEnabled={competition.officialQualificationFilterEnabled ?? false}
                  templates={qualificationTemplates ?? []}
                />

                {showTechnicalOfficialRecruitment ? (
                  <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="rounded-lg border border-border/70 bg-background p-3">
                      <h3 className="text-sm font-semibold text-foreground">TO必要人数設定</h3>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        個人エントリー件数の閾値ごとに必要人数を定義します。
                      </p>
                      <div className="mt-3">
                        <TechnicalOfficialSettingsEditor
                          organizationId={organizationId}
                          competitionId={competitionId}
                          canEdit={canEdit}
                          requireClubMembership={competition.requireClubMembership ?? false}
                          initialTiers={competition.technicalOfficialTiers}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border border-border/70 bg-background p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">不足クラブの確認</h3>
                          <p className="text-[11px] text-muted-foreground">
                            現在のエントリー状況に基づく不足人数を表示します。
                          </p>
                        </div>
                        <OfficialApplicationsCsvExportButton
                          rows={officialApplicationsCsvRows}
                          fileNameBase={`${competition.name}_オフィシャル応募一覧`}
                        />
                      </div>
                      <TechnicalOfficialShortagePanel rows={shortageRows} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-3 py-4 text-xs text-muted-foreground">
                    TO募集がOFFのため、TO必要人数設定と不足クラブ確認は表示されません。
                  </div>
                )}
              </section>

              <section className="space-y-2 rounded-xl border border-border/70 bg-background p-3 sm:p-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">2. 当日出席確認</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    当日の出席記録を登録・更新し、出席人数の集計・CSV 出力に利用します（当日運用の操作権限とは連動しません）。
                  </p>
                </div>
                <OfficialAttendanceSection
                  organizationId={organizationId}
                  competitionId={competitionId}
                  canEdit={canEdit}
                  compact
                />
              </section>

              <section className="space-y-2 rounded-xl border border-border/70 bg-background p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">3. 出席実績CSV出力</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      提出・集計用途向けに出席実績をCSVで出力できます。
                    </p>
                  </div>
                  <OfficialAttendancesCsvExportButton
                    rows={officialAttendancesCsvRows}
                    fileNameBase={`${competition.name}_当日出席オフィシャル一覧`}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  現在の大会種別: {competitionTypeLabel} / 1出席あたりの加算: {attendanceCountAdditionLabel}
                </p>
              </section>
            </section>
          ) : null}

          {!showOfficialRecruitment ? (
            <Card className="border-dashed border-border/80 bg-muted/15">
              <CardContent className="space-y-1 px-4 py-8 text-center text-sm text-muted-foreground">
                <p>現在はオフィシャル募集がOFFです。</p>
              </CardContent>
            </Card>
          ) : null}

        </TabsContent>

        <TabsContent value="entries" className="min-w-0 space-y-5 pt-4">
          <CompetitionEntriesTabContent
            organizationId={organizationId}
            competitionId={competitionId}
            canEdit={canEdit}
          />
        </TabsContent>

        <TabsContent value="finance" className="min-w-0 space-y-5 pt-4">
          <CompetitionFinanceTabContent
            organizationId={organizationId}
            competitionId={competitionId}
            canEdit={canEdit}
          />
        </TabsContent>

      </CompetitionManagementTabsClient>
    </div>
  );
}
