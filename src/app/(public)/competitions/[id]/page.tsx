import { Suspense } from "react";
import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { competitionMetadataTitleOnly } from "@/lib/competitionMetadata";
import {
  loadCompetitionPublicShell,
  loadSessionContextForPublicCompetition,
} from "@/lib/competitionPublicPageLoader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BadgeCheck,
  Building2,
  Calendar,
  ChevronRight,
  ClipboardList,
  MapPin,
  Users,
} from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { hasOrgAdminAccess, isClubAdminRole } from "@/lib/roleScopes";
import {
  competitionHostAbbreviation,
  competitionHostDisplayName,
} from "@/lib/competitionHostDisplay";
import {
  formatCompactJaDateRange,
  formatCompetitionEntryPeriodRangeJa,
} from "@/lib/datetimeLocal";
import { verifyDayOpsUnlockFromCookies } from "@/lib/dayOpsUnlockCookie";
import CompetitionPublicPageTabs from "@/components/public/CompetitionPublicPageTabs";
import { cn } from "@/lib/utils";
import { CompetitionHostInquiryDialogLazy } from "./_components/competitionPublicDynamicClients";
import { CompetitionPublicOverviewPanelLoader } from "./_components/CompetitionPublicOverviewPanelLoader";
import { CompetitionPublicStartListPanelLoader } from "./_components/CompetitionPublicStartListPanelLoader";
import {
  CompetitionPublicOverviewPanelSkeleton,
  CompetitionPublicStartListPanelSkeleton,
} from "./_components/CompetitionPublicPageSkeleton";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return competitionMetadataTitleOnly(id);
}

function getStatusLabel(status: string) {
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
}

function getStatusBadgeClass(status: string) {
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

  const [session, hasDayOpsUnlock] = await Promise.all([
    verifySessionCached(token),
    verifyDayOpsUnlockFromCookies(id),
  ]);
  const sessionUserId = session?.userId ?? null;

  const [competition, sessionContext] = await Promise.all([
    loadCompetitionPublicShell(id, sessionUserId),
    sessionUserId
      ? loadSessionContextForPublicCompetition(sessionUserId)
      : Promise.resolve({
          sessionApprovedMemberships: [],
          sessionUserForInquiry: null,
        }),
  ]);

  const { sessionApprovedMemberships, sessionUserForInquiry } = sessionContext;

  if (!competition) {
    notFound();
  }

  const orgAdminsForCurrentUser = competition.organization.admins;
  const isOrgAdmin = hasOrgAdminAccess(orgAdminsForCurrentUser);

  if (competition.status === "DRAFT" && !isOrgAdmin) {
    notFound();
  }

  const hasIndividualEvents = competition.events.some((e) => e.type === "INDIVIDUAL");
  const hasTeamEvents = competition.events.some((e) => e.type === "TEAM");

  const teamEntryMemberships = hasTeamEvents ? sessionApprovedMemberships : [];
  const firstAdminClubForTeamEntry = teamEntryMemberships.find((m) =>
    isClubAdminRole(m.role)
  )?.club;
  const showTeamEntryButton = hasTeamEvents && Boolean(firstAdminClubForTeamEntry);

  const senderNamePreview =
    sessionUserId && sessionUserForInquiry
      ? `${sessionUserForInquiry.profile?.familyName ?? ""} ${sessionUserForInquiry.profile?.givenName ?? ""}`.trim() ||
        "（氏名未設定）"
      : "";

  const hostAbbr = competitionHostAbbreviation(competition);

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

  const isEntryWindowOpen =
    entryStart !== null && entryEnd !== null && now >= entryStart && now <= entryEnd;
  const showEntryLinks = competition.events.length > 0 && competition.status !== "CANCELLED";
  const isOfficialRecruitmentOn =
    (competition.officialRecruitmentEnabled ?? true) && competition.status !== "CANCELLED";
  const showOfficialEntryButton = showEntryLinks && isOfficialRecruitmentOn;
  const entryButtonCount =
    (hasIndividualEvents || hasTeamEvents ? 1 : 0) +
    (showTeamEntryButton ? 1 : 0) +
    (showOfficialEntryButton ? 1 : 0);

  const withLoginRedirect = (path: string) =>
    sessionUserId ? path : `/login?redirect=${encodeURIComponent(path)}`;

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
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      getStatusBadgeClass(competition.status)
                    )}
                  >
                    {getStatusLabel(competition.status)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      entryPeriodBadgeClass
                    )}
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
                    <CompetitionHostInquiryDialogLazy
                      competitionId={id}
                      competitionName={competition.name}
                      senderNamePreview={senderNamePreview}
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
                        <Button
                          variant="link"
                          className="mx-0.5 inline h-auto min-h-0 p-0 text-xs font-medium"
                          asChild
                        >
                          <Link href={signInRedirectPath}>ログイン</Link>
                        </Button>
                        が必要です。未登録の方はログイン画面からアカウント作成へ進めます。
                      </p>
                    ) : null}

                    <div
                      className={cn(
                        "grid gap-2.5",
                        entryButtonCount === 1 && "max-w-md",
                        entryButtonCount >= 2 && "sm:grid-cols-2",
                        entryButtonCount >= 3 && "lg:grid-cols-3"
                      )}
                    >
                      {hasIndividualEvents || hasTeamEvents ? (
                        <Button
                          asChild
                          size="sm"
                          className="h-auto min-h-10 w-full whitespace-normal px-3 py-2.5 font-semibold shadow-sm"
                        >
                          <Link
                            href={withLoginRedirect(appRoutes.competitions.entry(competition.id))}
                            className="gap-2"
                          >
                            <Users className="h-4 w-4 shrink-0 opacity-85" aria-hidden />
                            <span className="min-w-0 flex-1 text-balance leading-snug">
                              個人エントリー
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                          </Link>
                        </Button>
                      ) : null}
                      {showTeamEntryButton && firstAdminClubForTeamEntry ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-auto min-h-10 w-full whitespace-normal border-primary/20 bg-background/80 px-3 py-2.5 font-medium shadow-sm hover:bg-muted/50"
                        >
                          <Link
                            href={withLoginRedirect(
                              appRoutes.competitions.teamEntry(competition.id, {
                                clubId: firstAdminClubForTeamEntry.id,
                              })
                            )}
                            className="gap-2"
                          >
                            <Building2 className="h-4 w-4 shrink-0 opacity-85" aria-hidden />
                            <span className="min-w-0 flex-1 text-balance leading-snug">
                              クラブ管理者（チーム種目エントリー）
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                          </Link>
                        </Button>
                      ) : null}
                      {showOfficialEntryButton ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-auto min-h-10 w-full whitespace-normal border-primary/25 bg-background/80 px-3 py-2.5 font-medium shadow-sm hover:bg-muted/50"
                        >
                          <Link
                            href={withLoginRedirect(
                              appRoutes.competitions.officialEntry(competition.id)
                            )}
                            className="gap-2"
                          >
                            <BadgeCheck className="h-4 w-4 shrink-0 opacity-85" aria-hidden />
                            <span className="min-w-0 flex-1 text-balance leading-snug">
                              オフィシャルエントリー
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                          </Link>
                        </Button>
                      ) : null}
                    </div>

                    {entryStart && entryEnd ? (
                      <p
                        className={cn(
                          "max-w-prose text-[11px] leading-relaxed sm:text-xs",
                          isEntryWindowOpen
                            ? "text-emerald-800 dark:text-emerald-300/90"
                            : "text-muted-foreground"
                        )}
                      >
                        {isEntryWindowOpen
                          ? "この時間帯はエントリー手続き・決済が可能です。個人エントリーでは、個人種目に出場するか、チーム種目の割り当て候補として登録するかを選べます。"
                          : "表示の期間外でも、主催の設定により手続きできる場合があります。詳細は手続き画面でご確認ください。"}
                      </p>
                    ) : null}
                    {sessionUserId && hasTeamEvents && !showTeamEntryButton ? (
                      <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                        チーム種目のエントリーは、所属クラブの
                        <strong className="font-medium text-foreground">管理者</strong>
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
            <Suspense fallback={<CompetitionPublicOverviewPanelSkeleton />}>
              <CompetitionPublicOverviewPanelLoader
                competitionId={id}
                sessionUserId={sessionUserId}
                hasIndividualEvents={hasIndividualEvents}
                hasTeamEvents={hasTeamEvents}
                showEntryLinks={showEntryLinks}
              />
            </Suspense>
          ) : null
        }
        startList={
          activeTab === "start-list" ? (
            <Suspense fallback={<CompetitionPublicStartListPanelSkeleton />}>
              <CompetitionPublicStartListPanelLoader
                competitionId={id}
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
