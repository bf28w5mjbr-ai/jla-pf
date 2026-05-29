import { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { canViewClubDetailPage, redirectUnlessCanViewClubDetail } from "@/lib/clubAccess";
import { prisma } from "@/server/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/DataTable";
import { isClubAdminRole } from "@/lib/roleScopes";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  CircleDot,
  MapPin,
  Phone,
  Trophy,
  Users,
} from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { cn } from "@/lib/utils";
import { membershipRoleLabelJa } from "@/lib/membershipDisplay";
import { parseClubDetailTab } from "@/lib/clubDetailTab";
import ClubDetailTabsClient from "@/components/ClubDetailTabsClient";
import {
  ClubActivitiesLazy,
  ClubAnnouncementsLazy,
  ClubLogoUploadLazy,
  ClubRepresentativeSelectorLazy,
  LeaveClubButtonLazy,
  MemberActionsLazy,
} from "./_components/clubDynamicClients";
import {
  ClubCompetitionSectionCount,
  ClubCompetitionTabBadgeCount,
} from "./_components/ClubCompetitionSectionCount";
import { ClubCompetitionsTabPanel } from "./_components/ClubCompetitionsTabPanel";
import { ClubCompetitionsTabSkeleton } from "./_components/ClubCompetitionsTabSkeleton";

export const dynamic = "force-dynamic";

function membershipStatusLabel(status: string): string {
  switch (status) {
    case "APPROVED":
      return "承認済み";
    case "PENDING":
      return "承認待ち";
    case "REJECTED":
      return "却下";
    default:
      return status;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId || !(await canViewClubDetailPage(id, sess.userId))) {
    return { title: "クラブ | Bluvium" };
  }

  const club = await prisma.club.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: `${club?.name || "クラブ"} | Bluvium`,
  };
}

export default async function ClubDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const sessionUser = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { id: true },
  });

  if (!sessionUser) redirect("/login");

  await redirectUnlessCanViewClubDetail(id, sess.userId);

  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      creator: {
        select: {
          profile: { select: { familyName: true, givenName: true } },
        },
      },
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { familyName: true, givenName: true } },
            },
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!club) {
    redirect(appRoutes.clubs.list());
  }

  const userMembership = club.memberships.find((m) => m.userId === sess.userId);
  const isClubAdmin = !!(userMembership && isClubAdminRole(userMembership.role));
  const approvedMembers = club.memberships.filter((m) => m.status === "APPROVED");
  const pendingMembers = club.memberships.filter((m) => m.status === "PENDING");

  const clubStatusLabel = {
    APPROVED: "運用中",
    SUSPENDED: "停止中",
    APPLYING: "（旧）申請中",
    JLA_APPROVED: "（旧）審査通過",
    INACTIVE: "（旧）無効",
  } as const;

  const officeAddressParts = [
    club.officePostalCode ? `〒${club.officePostalCode}` : null,
    [club.officePrefecture, club.officeCity].filter(Boolean).join(""),
    club.officeAddressLine1?.trim() || null,
    club.officeAddressLine2?.trim() || null,
  ].filter(Boolean) as string[];
  const officeAddressLine = officeAddressParts.join("");

  const activeTab = parseClubDetailTab(tab);

  const clubStatusBadgeClass = {
    APPROVED: "border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
    SUSPENDED: "border-rose-200 bg-rose-100 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100",
    APPLYING: "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
    JLA_APPROVED: "border-orange-200 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100",
    INACTIVE: "border-border bg-muted text-muted-foreground",
  } as const;

  return (
    <div className="app-page mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <header>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-muted/35 via-background to-muted/25 shadow-sm">
          <div className="space-y-2 p-3 sm:space-y-2.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs sm:text-sm" asChild>
                <Link href={appRoutes.clubs.list()}>
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
                  <span className="max-sm:sr-only">クラブ一覧に戻る</span>
                  <span className="sm:hidden">戻る</span>
                </Link>
              </Button>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                {isClubAdmin ? (
                  <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5 text-xs sm:gap-1.5 sm:px-3 sm:text-sm" asChild>
                    <Link href={appRoutes.clubs.edit(club.id)}>
                      クラブ情報を編集
                      <ChevronRight className="h-3.5 w-3.5 opacity-70 sm:h-4 sm:w-4" aria-hidden />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-primary">
              <Users className="h-4 w-4 shrink-0 sm:h-[1.125rem] sm:w-[1.125rem]" strokeWidth={1.75} aria-hidden />
              <span className="text-xs font-medium sm:text-sm">クラブ</span>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="inline-flex shrink-0 flex-col items-center rounded-lg border border-border/50 bg-muted/10 p-1.5 shadow-sm">
                <ClubLogoUploadLazy
                  clubId={club.id}
                  currentLogoUrl={club.logoUrl}
                  clubName={club.name}
                  canEdit={isClubAdmin}
                  variant="compact"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h1 className="text-balance text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  {club.name}
                </h1>
                {club.nameKana ? (
                  <p className="text-xs text-muted-foreground sm:text-sm">{club.nameKana}</p>
                ) : null}
                <ClubRepresentativeSelectorLazy
                  clubId={club.id}
                  currentRepresentativeUserId={club.representativeUserId}
                  isClubAdmin={isClubAdmin}
                  layout="inline"
                  representativeNameFallback={
                    [club.representativeFamilyName, club.representativeGivenName]
                      .map((s) => s?.trim())
                      .filter(Boolean)
                      .join(" ") || null
                  }
                  members={approvedMembers.map((m) => ({
                    userId: m.userId,
                    name: `${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim(),
                  }))}
                />
              </div>
            </div>

            <div
              className="grid gap-1.5 border-t border-border/60 pt-2.5 sm:grid-cols-3 sm:pt-3"
              role="group"
              aria-label="クラブの概要"
            >
              <div className="flex min-h-0 items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 sm:min-h-[2.5rem] sm:gap-2 sm:px-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:h-8 sm:w-8">
                  <CircleDot className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-medium text-muted-foreground">状態</span>
                  <div className="mt-0.5">
                    <span
                      className={cn(
                        "inline-flex w-fit max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                        clubStatusBadgeClass[club.status as keyof typeof clubStatusBadgeClass] ??
                          "border-border bg-muted text-muted-foreground"
                      )}
                    >
                      {clubStatusLabel[club.status as keyof typeof clubStatusLabel] ?? club.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex min-h-0 items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 sm:min-h-[2.5rem] sm:gap-2 sm:px-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:h-8 sm:w-8">
                  <Trophy className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} aria-hidden />
                </div>
                <div>
                  <span className="text-[11px] font-medium text-muted-foreground">参加大会</span>
                  <p className="text-xs font-semibold tabular-nums text-foreground sm:text-sm">
                    <Suspense
                      fallback={
                        <>
                          <span className="inline-block h-4 w-6 animate-pulse rounded bg-muted-foreground/15" />
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground sm:text-xs">
                            件
                          </span>
                        </>
                      }
                    >
                      <ClubCompetitionSectionCount clubId={id} clubName={club.name} />
                    </Suspense>
                  </p>
                </div>
              </div>
              <div className="flex min-h-0 items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 sm:min-h-[2.5rem] sm:gap-2 sm:px-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:h-8 sm:w-8">
                  <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} aria-hidden />
                </div>
                <div>
                  <span className="text-[11px] font-medium text-muted-foreground">メンバー</span>
                  <p className="text-xs font-semibold tabular-nums text-foreground sm:text-sm">
                    {approvedMembers.length.toLocaleString("ja-JP")}
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground sm:text-xs">名</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-border/60 pt-2.5 sm:pt-3">
              <p className="mb-2 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                大会エントリーやお問い合わせの際に参照されることがあります。
              </p>
              <div className="rounded-lg border border-border/40 bg-background/40 p-2 sm:p-2.5">
                <div className="grid gap-1.5 text-sm sm:grid-cols-2 sm:gap-x-3 sm:gap-y-2 lg:grid-cols-3">
                  {club.representativePhone ? (
                    <div className="flex min-w-0 items-start gap-1.5">
                      <Phone className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                      <div className="min-w-0 leading-snug">
                        <span className="text-[11px] font-medium text-muted-foreground">代表者TEL</span>
                        <p className="tabular-nums font-medium text-foreground">{club.representativePhone}</p>
                      </div>
                    </div>
                  ) : null}
                  {club.officePhone ? (
                    <div className="flex min-w-0 items-start gap-1.5">
                      <Phone className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                      <div className="min-w-0 leading-snug">
                        <span className="text-[11px] font-medium text-muted-foreground">事務局TEL</span>
                        <p className="tabular-nums font-medium text-foreground">{club.officePhone}</p>
                      </div>
                    </div>
                  ) : null}
                  {club.establishedYear ? (
                    <div className="flex min-w-0 items-start gap-1.5">
                      <Calendar className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                      <div className="leading-snug">
                        <span className="text-[11px] font-medium text-muted-foreground">設立年</span>
                        <p className="tabular-nums font-medium text-foreground">{club.establishedYear}年</p>
                      </div>
                    </div>
                  ) : null}
                  {club.patrolLocation ? (
                    <div className="flex min-w-0 items-start gap-1.5 sm:col-span-2 lg:col-span-1">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                      <div className="min-w-0 leading-snug">
                        <span className="text-[11px] font-medium text-muted-foreground">監視場所</span>
                        <p className="text-sm font-medium leading-snug text-foreground">{club.patrolLocation}</p>
                      </div>
                    </div>
                  ) : null}
                </div>

                {officeAddressLine ? (
                  <div className="mt-2.5 flex min-w-0 items-start gap-1.5 border-t border-border/50 pt-2.5">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                    <div className="min-w-0 leading-snug">
                      <span className="text-[11px] font-medium text-muted-foreground">事務局所在地</span>
                      <p className="text-xs font-medium leading-snug text-foreground sm:text-sm">
                        {officeAddressLine}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {userMembership?.status === "APPROVED" ? (
              <div className="flex justify-end border-t border-border/60 pt-2.5 sm:pt-3">
                <LeaveClubButtonLazy clubId={club.id} clubName={club.name} />
              </div>
            ) : null}
          </div>
        </div>
      </header>

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
                  {approvedMembers.length}
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
                    <ClubCompetitionTabBadgeCount clubId={id} clubName={club.name} />
                  </Suspense>
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

        <TabsContent value="members" className="space-y-3 pt-1.5 sm:space-y-4 sm:pt-2">
          {userMembership && (
            <ClubAnnouncementsLazy
              clubId={club.id}
              currentUserId={sess.userId}
              currentUserRole={userMembership.role}
            />
          )}

          {userMembership && (
            <ClubActivitiesLazy
              clubId={club.id}
              currentUserId={sess.userId}
              currentUserRole={userMembership.role}
            />
          )}

          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-border/60 pb-2">
              <Users className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="text-lg font-semibold tracking-tight text-foreground">メンバー管理</h2>
            </div>

            {isClubAdmin && pendingMembers.length > 0 && (
              <Card padding="none">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <span>参加申請</span>
                    <Badge variant="secondary" className="tabular-nums">
                      {pendingMembers.length} 件
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <DataTable
                  data={pendingMembers}
                  columns={[
                    {
                      header: "氏名",
                      accessor: (m) => `${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim(),
                      className: "font-medium text-foreground",
                    },
                    {
                      header: "メール",
                      accessor: (m) => m.user.email,
                      className: "font-mono text-sm text-muted-foreground",
                    },
                    {
                      header: "申請日",
                      accessor: (m) => new Date(m.createdAt).toLocaleDateString("ja-JP"),
                      className: "text-sm text-muted-foreground",
                    },
                    {
                      header: "操作",
                      accessor: (m) => (
                        <MemberActionsLazy
                          membershipId={m.id}
                          clubId={club.id}
                          status={m.status}
                          role={m.role}
                          currentUserId={sess.userId}
                          targetUserId={m.userId}
                          currentUserRole={userMembership?.role || "MEMBER"}
                        />
                      ),
                    },
                  ]}
                  keyExtractor={(m) => m.id}
                  emptyMessage="申請はありません"
                />
              </Card>
            )}

            <Card padding="none">
              <CardHeader>
                <CardTitle className="text-base">メンバー一覧</CardTitle>
              </CardHeader>
              <DataTable
                data={approvedMembers}
                columns={[
                  {
                    header: "氏名",
                    accessor: (m) => `${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim(),
                    className: "font-medium text-foreground",
                  },
                  {
                    header: "役割",
                    accessor: (m) => (
                      <Badge
                        variant={isClubAdminRole(m.role) ? "default" : "secondary"}
                        className="font-normal"
                      >
                        {membershipRoleLabelJa(m.role)}
                      </Badge>
                    ),
                  },
                  {
                    header: "ステータス",
                    accessor: (m) => (
                      <Badge
                        variant="outline"
                        className={cn(
                          m.status === "APPROVED" &&
                            "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
                          m.status === "PENDING" &&
                            "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
                          m.status === "REJECTED" &&
                            "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
                        )}
                      >
                        {membershipStatusLabel(m.status)}
                      </Badge>
                    ),
                  },
                  ...(isClubAdmin
                    ? [
                        {
                          header: "操作",
                          accessor: (m: (typeof club.memberships)[0]) => (
                            <MemberActionsLazy
                              membershipId={m.id}
                              clubId={club.id}
                              status={m.status}
                              role={m.role}
                              currentUserId={sess.userId}
                              targetUserId={m.userId}
                              currentUserRole={userMembership?.role || "MEMBER"}
                            />
                          ),
                        },
                      ]
                    : []),
                ]}
                keyExtractor={(m) => m.id}
                emptyMessage="メンバーがいません"
              />
            </Card>
          </div>
        </TabsContent>

{activeTab === "competitions" ? (
          <Suspense fallback={<ClubCompetitionsTabSkeleton />}>
            <ClubCompetitionsTabPanel clubId={id} clubName={club.name} isClubAdmin={isClubAdmin} />
          </Suspense>
        ) : null}
        </ClubDetailTabsClient>
      </div>
    </div>
  );
}
