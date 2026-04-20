import type { ReactNode } from "react";
import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BadgeCheck,
  Building2,
  Calendar,
  ChevronRight,
  ClipboardList,
  Coins,
  FileText,
  ListOrdered,
  MapPin,
  UserCog,
  Users,
} from "lucide-react";
import CompetitionRelationsEditor from "@/components/CompetitionRelationsEditor";
import CompetitionAnnouncementsManager from "@/components/CompetitionAnnouncementsManager";
import CompetitionAttachmentsManager from "@/components/CompetitionAttachmentsManager";
import CompetitionPublicGallery from "@/components/CompetitionPublicGallery";
import CompetitionStartListPanel from "@/components/CompetitionStartListPanel";
import { appRoutes } from "@/lib/appRoutes";
import { hasOrgAdminAccess, isClubAdminRole } from "@/lib/roleScopes";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import {
  competitionHostAbbreviation,
  competitionHostDisplayName,
} from "@/lib/competitionHostDisplay";
import {
  formatCompactJaDateRange,
  formatCompetitionEntryPeriodRangeJa,
} from "@/lib/datetimeLocal";
import {
  buildParticipationEventSections,
  isUnassignedParticipationAgeBlock,
} from "@/lib/competitionPublicParticipationEvents";
import { relationLogosWithDisplaySrc } from "@/lib/relationLogos";
import { ensureStartListSnapshotIfEligible } from "@/lib/startListSnapshot";
import { parseTechnicalOfficialTiers } from "@/lib/technicalOfficialRules";
import { verifyDayOpsUnlockFromCookies } from "@/lib/dayOpsUnlockCookie";
import DayOpsUnlockBanner from "@/components/DayOpsUnlockBanner";
import CompetitionPublicPageTabs from "@/components/public/CompetitionPublicPageTabs";
import { CompetitionHostInquiryDialog } from "@/components/public/CompetitionHostInquiryDialog";
import { cn } from "@/lib/utils";
import {
  CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP,
  parseAgeCategoryFeeTiers,
  parseAgeFeeTiers,
  parseAgeQualificationTiers,
  requiredQualificationsMentionCertifiedLifesaver,
  unionRequiredQualifications,
} from "@/lib/competitionEntryAgeTiered";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const competition = await prisma.competition.findUnique({
    where: { id },
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
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const requestedTab = tab ?? "overview";
  const activeTab =
    requestedTab === "overview" || requestedTab === "start-list" ? requestedTab : "overview";
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);
  const sessionUserId = session?.userId ?? null;

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          admins: {
            where: { userId: sessionUserId ?? "clinvalidnosessionuser0000" },
          },
        },
      },
      technicalOfficialQualificationTemplate: {
        select: { name: true },
      },
      announcements: {
        where: { publishedAt: { not: null } },
        orderBy: { createdAt: "desc" },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
      },
      galleryPhotos: {
        orderBy: { createdAt: "asc" },
        select: { id: true, imageUrl: true, fileName: true },
      },
      ageCategories: {
        orderBy: { displayOrder: "asc" },
        select: { id: true, name: true, displayOrder: true },
      },
      events: {
        select: {
          id: true,
          name: true,
          sex: true,
          type: true,
          category: true,
          displayOrder: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          startListRoundCount: true,
          ageCategory: {
            select: { id: true, name: true, displayOrder: true },
          },
        },
        orderBy: [{ displayOrder: "asc" }, { sex: "asc" }, { id: "asc" }],
      },
      officialApplications: {
        where: { userId: sessionUserId ?? "clinvalidnosessionuser0000" },
        select: { status: true, positionName: true, message: true },
        take: 1,
      },
    },
  });

  if (!competition) {
    notFound();
  }

  const dayOpsUnlockConfigured = Boolean(competition.dayOpsAccessSecretHash);
  const hasDayOpsUnlock = await verifyDayOpsUnlockFromCookies(id);

  const isOrgAdmin = hasOrgAdminAccess(competition.organization.admins);
  const canEditStartListSplit = canManageCompetitionStartListSettings({
    orgAdminsForCurrentUser: competition.organization.admins,
    hasDayOpsUnlock,
  });

  // 公開されていない大会は、管理者以外は表示しない
  if (competition.status === "DRAFT" && !isOrgAdmin) {
    notFound();
  }

  const hasIndividualEvents = competition.events.some((e) => e.type === "INDIVIDUAL");
  const hasTeamEvents = competition.events.some((e) => e.type === "TEAM");

  const sessionApprovedMemberships = sessionUserId
    ? await prisma.membership.findMany({
        where: { userId: sessionUserId, status: "APPROVED" },
        include: { club: { select: { id: true, name: true } } },
        orderBy: { club: { name: "asc" } },
      })
    : [];
  const teamEntryMemberships = hasTeamEvents ? sessionApprovedMemberships : [];
  const firstAdminClubForTeamEntry = teamEntryMemberships.find((m) =>
    isClubAdminRole(m.role)
  )?.club;
  /** 公開ページの「チームエントリー」導線はクラブ管理者のみ（ログインかつ管理クラブあり） */
  const showTeamEntryButton = hasTeamEvents && Boolean(firstAdminClubForTeamEntry);

  const sessionUserForInquiry = sessionUserId
    ? await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { familyName: true, givenName: true },
      })
    : null;
  const senderPreviewLine =
    sessionUserId && sessionUserForInquiry
      ? `${sessionUserForInquiry.familyName} ${sessionUserForInquiry.givenName}`.trim() +
        "／" +
        (sessionApprovedMemberships.length > 0
          ? sessionApprovedMemberships.map((m) => m.club.name).join("、")
          : "所属クラブなし")
      : "";

  const hostAbbr = competitionHostAbbreviation(competition);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ja-JP").format(value);
  };

  /** 種目の有無に応じて、該当カテゴリの参加費だけ表示。表示する行がなければ null */
  const renderEntryFeeForCategories = (
    entryFee: unknown,
    opts: { hasIndividualEvents: boolean; hasTeamEvents: boolean }
  ): ReactNode => {
    const { hasIndividualEvents, hasTeamEvents } = opts;
    if (entryFee === null || entryFee === undefined) {
      return null;
    }

    if (typeof entryFee === "number") {
      if (!hasIndividualEvents && !hasTeamEvents) return null;
      if (hasIndividualEvents && hasTeamEvents) {
        return (
          <p className="text-sm font-medium">¥{formatCurrency(entryFee)}</p>
        );
      }
      if (hasIndividualEvents) {
        return (
          <p className="text-sm font-medium">個人: ¥{formatCurrency(entryFee)}</p>
        );
      }
      return (
        <p className="text-sm font-medium">
          チーム（1チーム）: ¥{formatCurrency(entryFee)}
        </p>
      );
    }

    if (typeof entryFee !== "object") {
      return <p className="text-sm font-medium">未設定</p>;
    }

    const feeCatTiers = parseAgeCategoryFeeTiers(entryFee);
    if (feeCatTiers?.length && competition.ageCategories?.length) {
      const nameById = new Map(competition.ageCategories.map((c) => [c.id, c.name]));
      return (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">年齢カテゴリ別（生年月日の区分）</p>
          {feeCatTiers.map((t, i) => (
            <p key={i} className="text-sm font-medium leading-snug">
              {nameById.get(t.ageCategoryId) ?? "区分"}
              {hasIndividualEvents ? (
                <>
                  {" "}
                  · 個人 ¥{formatCurrency(t.individualEntryFee)}
                </>
              ) : null}
              {hasTeamEvents ? (
                <>
                  {" "}
                  · チーム（1）¥{formatCurrency(t.teamEntryFeePerTeam)}
                </>
              ) : null}
            </p>
          ))}
        </div>
      );
    }

    const feeTiers = parseAgeFeeTiers(entryFee);
    if (feeTiers?.length) {
      return (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">年齢帯別（開催日時点の満年齢）</p>
          {feeTiers.map((t, i) => (
            <p key={i} className="text-sm font-medium leading-snug">
              {t.minAge}歳〜{t.maxAge == null ? "上限なし" : `${t.maxAge}歳`}
              {hasIndividualEvents ? (
                <>
                  {" "}
                  · 個人 ¥{formatCurrency(t.individualEntryFee)}
                </>
              ) : null}
              {hasTeamEvents ? (
                <>
                  {" "}
                  · チーム（1）¥{formatCurrency(t.teamEntryFeePerTeam)}
                </>
              ) : null}
            </p>
          ))}
        </div>
      );
    }

    const fee = entryFee as {
      individualEntryFee?: number;
      teamEntryFeePerTeam?: number;
      baseFee?: number;
    };
    const individualFee = fee.individualEntryFee ?? fee.baseFee;
    const teamFee = fee.teamEntryFeePerTeam;

    const showIndividual =
      hasIndividualEvents && typeof individualFee === "number";
    const showTeam = hasTeamEvents && typeof teamFee === "number";

    if (!showIndividual && !showTeam) {
      return null;
    }

    return (
      <div className="space-y-0.5">
        {showIndividual ? (
          <p className="text-sm font-medium">個人: ¥{formatCurrency(individualFee)}</p>
        ) : null}
        {showTeam ? (
          <p className="text-xs text-muted-foreground">
            チーム（1チーム）: ¥{formatCurrency(teamFee)}
          </p>
        ) : null}
      </div>
    );
  };

  const renderRequiredQualifications = (requiredQualifications: unknown) => {
    const tiered = parseAgeQualificationTiers(requiredQualifications);
    if (tiered?.length) {
      return (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">年齢帯別</p>
          {tiered.map((t, i) => (
            <p key={i} className="text-sm font-medium leading-snug">
              {t.minAge}〜{t.maxAge == null ? "上限なし" : `${t.maxAge}歳`}
              {t.requiredQualifications.length > 0
                ? ` · ${t.requiredQualifications.join("、")}`
                : " · 資格不要"}
            </p>
          ))}
        </div>
      );
    }

    const items = unionRequiredQualifications(requiredQualifications);

    if (items.length === 0) {
      return <p className="text-sm font-medium">資格不要</p>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    );
  };

  const renderParticipantEligibility = (value: unknown) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return <p className="text-sm font-medium">制限なし</p>;
    }

    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{value}</p>;
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "DRAFT": return "下書き";
      case "PUBLISHED": return "公開中";
      case "ONGOING": return "開催中";
      case "COMPLETED": return "終了";
      case "CANCELLED": return "中止";
      default: return status;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return "border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "DRAFT":
        return "border-transparent bg-muted text-muted-foreground";
      case "ONGOING":
        return "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "COMPLETED":
        return "border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "CANCELLED":
        return "border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "border-transparent bg-muted text-muted-foreground";
    }
  };
  const now = new Date();
  const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
  const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;

  const entryPeriodLabel =
    !entryStart || !entryEnd
      ? "エントリー期間未設定"
      : now < entryStart
        ? "エントリー開始前"
        : now > entryEnd
          ? "エントリー終了"
          : "エントリー受付中";

  const entryPeriodBadgeClass =
    entryPeriodLabel === "エントリー受付中"
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-200"
      : entryPeriodLabel === "エントリー開始前"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-200"
        : entryPeriodLabel === "エントリー終了"
          ? "bg-muted text-muted-foreground"
          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

  const participationEventSections =
    activeTab === "overview"
      ? buildParticipationEventSections(competition.events, competition.ageCategories)
      : [];
  const technicalOfficialTiers =
    activeTab === "overview"
      ? parseTechnicalOfficialTiers(competition.technicalOfficialTiers)
      : [];
  const showTechnicalOfficialPublicBlock =
    (competition.officialRecruitmentEnabled ?? true) &&
    (competition.technicalOfficialRecruitmentEnabled ?? true) &&
    technicalOfficialTiers.length > 0 && competition.technicalOfficialQualificationTemplate;

  const isEntryWindowOpen =
    entryStart !== null &&
    entryEnd !== null &&
    now >= entryStart &&
    now <= entryEnd;
  const showEntryLinks =
    competition.events.length > 0 && competition.status !== "CANCELLED";
  const isOfficialRecruitmentOn =
    (competition.officialRecruitmentEnabled ?? true) && competition.status !== "CANCELLED";
  const showOfficialEntryButton = showEntryLinks && isOfficialRecruitmentOn;
  const entryButtonCount =
    (hasIndividualEvents ? 1 : 0) +
    (showTeamEntryButton ? 1 : 0) +
    (showOfficialEntryButton ? 1 : 0);
  const entryFeeDisplay =
    activeTab === "overview"
      ? renderEntryFeeForCategories(competition.entryFee, {
          hasIndividualEvents,
          hasTeamEvents,
        })
      : null;

  const withLoginRedirect = (path: string) =>
    sessionUserId ? path : `/login?redirect=${encodeURIComponent(path)}`;

  if (activeTab === "start-list") {
    try {
      await ensureStartListSnapshotIfEligible(id);
    } catch (e) {
      console.error("ensureStartListSnapshotIfEligible:", e);
    }
  }

  const signInRedirectPath = `/login?redirect=${encodeURIComponent(appRoutes.competitions.root(id))}`;

  return (
    <div className="app-page mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
      <Card className="overflow-hidden border-border/80 shadow-md ring-1 ring-border/40">
        <CardContent className="space-y-0 p-0">
          <div className="bg-gradient-to-br from-primary/[0.07] via-background to-muted/15 px-3 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <h1 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
                  {competition.name}
                </h1>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", getStatusBadgeClass(competition.status))}
                  >
                    {getStatusLabel(competition.status)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", entryPeriodBadgeClass)}
                  >
                    {entryPeriodLabel}
                  </Badge>
                </div>
              </div>
              {competition.nameKana ? (
                <p className="text-xs text-muted-foreground">{competition.nameKana}</p>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl border border-border/70 bg-card/90 p-3 shadow-sm backdrop-blur-sm sm:p-4">
              <div className="grid gap-3 text-sm">
                <div className="flex min-w-0 items-start gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  <div className="min-w-0 leading-snug">
                    <span className="text-[11px] font-medium text-muted-foreground">主催</span>
                    <p className="font-medium text-foreground">
                      {competitionHostDisplayName(competition)}
                      {hostAbbr ? (
                        <span className="font-normal text-muted-foreground">（{hostAbbr}）</span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 border-t border-border/50 pt-2 sm:grid-cols-2 sm:gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                    <div>
                      <span className="text-[11px] font-medium text-muted-foreground">開催日</span>
                      <p className="tabular-nums font-medium text-foreground">
                        {formatCompactJaDateRange(competition.startDate, competition.endDate)}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-start gap-2 sm:border-l sm:border-border/50 sm:pl-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                    <div className="min-w-0">
                      <span className="text-[11px] font-medium text-muted-foreground">会場</span>
                      <p className="font-medium text-foreground">{competition.venue}</p>
                      {competition.venueAddress ? (
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                          {competition.venueAddress}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
                {competition.status !== "CANCELLED" ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                    <CompetitionHostInquiryDialog
                      competitionId={id}
                      competitionName={competition.name}
                      senderPreviewLine={senderPreviewLine}
                      isAuthenticated={Boolean(sessionUserId)}
                      loginHref={signInRedirectPath}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {showEntryLinks ? (
            <div className="border-t border-border/80 bg-muted/10 px-3 py-4 sm:px-6 sm:py-5">
              <div className="overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-background to-muted/30 shadow-sm ring-1 ring-primary/5">
                <div className="flex gap-3 p-3 sm:gap-4 sm:p-5">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary shadow-inner sm:h-12 sm:w-12"
                    aria-hidden
                  >
                    <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="text-base font-semibold tracking-tight text-foreground">
                          エントリー
                        </h2>
                        {entryStart && entryEnd ? (
                          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                            <span className="font-medium text-foreground/80">受付期間</span>
                            <span className="max-sm:hidden"> · </span>
                            <span className="mt-0.5 block tabular-nums sm:mt-0 sm:inline">
                              {formatCompetitionEntryPeriodRangeJa(entryStart, entryEnd)}
                            </span>
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            種目のエントリー・お支払いはこちらから行えます。
                          </p>
                        )}
                      </div>
                      {entryStart && entryEnd ? (
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            isEntryWindowOpen
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                              : "border-border bg-muted/50 text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isEntryWindowOpen
                                ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]"
                                : "bg-muted-foreground/40"
                            }`}
                            aria-hidden
                          />
                          {isEntryWindowOpen ? "受付中" : "受付期間外の可能性"}
                        </span>
                      ) : null}
                    </div>

                    {!sessionUserId ? (
                      <p className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                        エントリー申込・お支払いには
                        <Button variant="link" className="mx-0.5 inline h-auto min-h-0 p-0 text-xs font-medium" asChild>
                          <Link href={signInRedirectPath}>ログイン</Link>
                        </Button>
                        が必要です。未登録の方はログイン画面からアカウント作成へ進めます。
                      </p>
                    ) : null}

                    <div
                      className={`grid gap-2 ${
                        entryButtonCount >= 3
                          ? "sm:grid-cols-3"
                          : entryButtonCount === 2
                            ? "sm:grid-cols-2"
                            : ""
                      }`}
                    >
                      {hasIndividualEvents ? (
                        <Button
                          asChild
                          size="sm"
                          className="h-10 w-full justify-center gap-1.5 font-semibold shadow-sm"
                        >
                          <Link href={withLoginRedirect(appRoutes.competitions.entry(competition.id))}>
                            エントリー
                            <ChevronRight className="h-3.5 w-3.5 opacity-70" />
                          </Link>
                        </Button>
                      ) : null}
                      {showTeamEntryButton && firstAdminClubForTeamEntry ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-10 w-full justify-center gap-1.5 border-primary/20 bg-background/80 font-medium shadow-sm hover:bg-muted/50"
                        >
                          <Link
                            href={withLoginRedirect(
                              appRoutes.clubs.competition.team(
                                firstAdminClubForTeamEntry.id,
                                competition.id,
                                { tab: "entry" }
                              )
                            )}
                          >
                            チームエントリー
                            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                          </Link>
                        </Button>
                      ) : null}
                      {showOfficialEntryButton ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-10 w-full justify-center gap-1.5 border-primary/25 bg-background/80 font-medium shadow-sm hover:bg-muted/50"
                        >
                          <Link
                            href={withLoginRedirect(
                              appRoutes.competitions.officialEntry(competition.id)
                            )}
                          >
                            オフィシャルエントリー
                            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                          </Link>
                        </Button>
                      ) : null}
                    </div>

                    {entryStart && entryEnd ? (
                      <p
                        className={`text-[11px] leading-relaxed ${isEntryWindowOpen ? "text-emerald-800 dark:text-emerald-300/90" : "text-muted-foreground"}`}
                      >
                        {isEntryWindowOpen
                          ? "この時間帯はエントリー手続き・決済が可能です。"
                          : "表示の期間外でも、主催の設定により手続きできる場合があります。詳細は手続き画面でご確認ください。"}
                      </p>
                    ) : null}
                    {sessionUserId && hasTeamEvents && !showTeamEntryButton ? (
                      <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                        チーム種目のエントリーは、所属クラブの<strong className="font-medium text-foreground">管理者</strong>
                        がクラブの「チーム管理」から登録します。
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <CompetitionPublicPageTabs
        competitionId={id}
        overview={
          activeTab === "overview" ? (
            <div className="space-y-4">
        {/* 参加情報 */}
        {(competition.events.length > 0 ||
          competition.maxParticipants ||
          entryFeeDisplay !== null ||
          (showEntryLinks && (hasIndividualEvents || hasTeamEvents))) && (
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/20 px-4 py-3 sm:px-5">
              <CardTitle className="text-base font-semibold tracking-tight">参加情報</CardTitle>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                種目・参加費・参加資格・対象者など、エントリー前にご確認ください。
              </p>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
              <div className="divide-y divide-border">
                {competition.events.length > 0 ? (
                  <div className="flex gap-3 px-4 py-3 sm:px-5">
                    <ListOrdered className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">種目</p>
                      <div className="mt-1.5 flex flex-col gap-4">
                        {participationEventSections.map((section) => (
                          <div key={section.category}>
                            {participationEventSections.length > 1 ? (
                              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-foreground/85">
                                {section.label}
                              </p>
                            ) : null}
                            <div className="flex flex-col gap-3">
                              {section.ageBlocks.map((block) => {
                                const framed = section.ageBlocks.length > 1;
                                const showAgeLabel =
                                  section.ageBlocks.length > 1 ||
                                  (section.ageBlocks.length === 1 &&
                                    !isUnassignedParticipationAgeBlock(block));
                                return (
                                  <div
                                    key={`${section.category}-${block.key}`}
                                    className={
                                      framed
                                        ? "rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 sm:px-3.5"
                                        : undefined
                                    }
                                  >
                                    {showAgeLabel ? (
                                      <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                                        {block.title}
                                      </p>
                                    ) : null}
                                    <ul className="flex flex-col gap-2">
                                      {block.rows.map((row) => (
                                        <li key={row.key} className="text-sm">
                                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                            <span className="font-medium text-foreground">{row.name}</span>
                                            <span className="text-[11px] leading-snug text-muted-foreground">
                                              {row.metaLine}
                                            </span>
                                          </div>
                                          {row.scheduleLine ? (
                                            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                                              {row.scheduleLine}
                                            </p>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {competition.maxParticipants ? (
                  <div className="flex gap-3 px-4 py-3 sm:px-5">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">最大参加者数</p>
                      <p className="mt-0.5 text-sm font-medium">
                        {competition.maxParticipants.toLocaleString()}名
                      </p>
                    </div>
                  </div>
                ) : null}

                {entryFeeDisplay !== null ? (
                  <div className="flex gap-3 px-4 py-3 sm:px-5">
                    <Coins className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">参加費</p>
                      <div className="mt-0.5">{entryFeeDisplay}</div>
                    </div>
                  </div>
                ) : null}

                <div className="flex gap-3 px-4 py-3 sm:px-5">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">参加資格</p>
                    <div className="mt-1">{renderRequiredQualifications(competition.requiredQualifications)}</div>
                    {requiredQualificationsMentionCertifiedLifesaver(competition.requiredQualifications) ? (
                      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                        {CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex gap-3 px-4 py-3 sm:px-5">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">参加対象者</p>
                    <div className="mt-1">{renderParticipantEligibility(competition.participantEligibilityText)}</div>
                  </div>
                </div>

                {showTechnicalOfficialPublicBlock ? (
                  <div className="flex gap-3 px-4 py-3 sm:px-5">
                    <UserCog className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">クラブ参加資格（テクニカルオフィシャル）</p>
                      <p className="text-sm leading-relaxed">
                        閾値の「件数」は、<strong className="font-medium text-foreground">クラブに紐づく個人エントリーの件数（キャンセル除く）</strong>
                        です。チーム種目のエントリー件数は含みません。段階表のうち、
                        <strong className="font-medium text-foreground">条件を満たす行のうち最も高い閾値の行だけ</strong>
                        が適用されます。
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        指定の資格を持つテクニカルオフィシャルが、上記に応じてクラブ単位で必要になります。
                      </p>
                      <p className="text-xs text-muted-foreground">
                        必要な資格:{" "}
                        <span className="font-medium text-foreground">
                          {competition.technicalOfficialQualificationTemplate?.name ?? "—"}
                        </span>
                      </p>
                      <ul className="space-y-1 text-sm">
                        {technicalOfficialTiers.map((t, i) => (
                          <li key={i} className="tabular-nums">
                            個人エントリー合計 {t.minEntries} 件以上 → テクニカルオフィシャル {t.requiredCount} 人
                          </li>
                        ))}
                      </ul>
                      {competition.requireClubMembership ? null : (
                        <p className="text-xs text-amber-900 dark:text-amber-100/90">
                          この大会は所属クラブの指定が不要なエントリーもあります。クラブに紐づくエントリーがある場合に限り、上記がクラブ単位の要件となります。
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 大会説明 */}
        {competition.description ? (
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/20 px-4 py-3 sm:px-5">
              <CardTitle className="text-base font-semibold tracking-tight">大会について</CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-4 sm:px-5 sm:py-5">
              <div className="max-w-3xl whitespace-pre-wrap text-sm leading-[1.7] text-foreground/90">
                {competition.description}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* 関係組織情報 */}
        <CompetitionRelationsEditor
          competitionId={competition.id}
          sponsors={competition.sponsors}
          cooperators={competition.cooperators}
          cooperatorsLogos={relationLogosWithDisplaySrc(competition.cooperatorsLogos)}
          supporters={competition.supporters}
          grants={competition.grants}
          grantsLogos={relationLogosWithDisplaySrc(competition.grantsLogos)}
          canEdit={false}
        />

        {competition.announcements.length > 0 ? (
          <CompetitionAnnouncementsManager
            competitionId={competition.id}
            initialAnnouncements={competition.announcements.map((a) => ({
              id: a.id,
              title: a.title,
              content: a.content,
              publishedAt: a.publishedAt?.toISOString() ?? null,
              createdAt: a.createdAt.toISOString(),
            }))}
            canEdit={false}
          />
        ) : null}

        {competition.attachments.length > 0 ? (
          <CompetitionAttachmentsManager
            competitionId={competition.id}
            initialAttachments={competition.attachments.map((a) => ({
              id: a.id,
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              fileSize: a.fileSize,
              mimeType: a.mimeType,
              createdAt: a.createdAt.toISOString(),
            }))}
            canEdit={false}
          />
        ) : null}

        <CompetitionPublicGallery photos={competition.galleryPhotos} />
          </div>
          ) : null
        }
        startList={
          activeTab === "start-list" ? (
            <>
          <DayOpsUnlockBanner
            competitionId={competition.id}
            passphraseConfigured={dayOpsUnlockConfigured}
            alreadyUnlocked={hasDayOpsUnlock}
          />
          <CompetitionStartListPanel
            canEditStartListSplit={canEditStartListSplit}
            canEditEventSchedule={canEditStartListSplit}
            canEditStartListRoundCount={canEditStartListSplit}
            competition={{
              id: competition.id,
              name: competition.name,
              startDate: competition.startDate,
              endDate: competition.endDate,
              events: competition.events.map((event) => ({
                id: event.id,
                name: event.name,
                sex: event.sex,
                type: event.type,
                displayOrder: event.displayOrder,
                ageCategoryId: event.ageCategory?.id ?? null,
                ageCategoryName: event.ageCategory?.name ?? null,
                scheduledStartAt: event.scheduledStartAt,
                scheduledEndAt: event.scheduledEndAt,
                startListRoundCount: event.startListRoundCount,
              })),
            }}
          />
            </>
          ) : null
        }
      />
    </div>
  );
}
