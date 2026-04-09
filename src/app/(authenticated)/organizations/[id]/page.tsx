import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { stripe } from "@/lib/stripe";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MemberManagementWrapper from "@/components/MemberManagementWrapper";
import OrganizationLogoManager from "@/components/OrganizationLogoManager";
import CompetitionListItem from "@/components/CompetitionListItem";
import OrganizationBusinessPanelTabContent from "@/components/admin/OrganizationBusinessPanelTabContent";
import OrganizationOnboardingPaymentBanner from "@/components/OrganizationOnboardingPaymentBanner";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Globe,
  Landmark,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { isOrgAdminRole } from "@/lib/roleScopes";
import { normalizeOptionalHttpUrl } from "@/lib/safeExternalUrl";
import { parseOrganizationDetailTab } from "@/lib/organizationDetailTab";
import { cn } from "@/lib/utils";
import OrganizationDetailTabsClient from "@/components/OrganizationDetailTabsClient";

export const dynamic = "force-dynamic";
const ORG_ONBOARDING_FEE = 10000;

async function reconcileOnboardingPayment(
  organizationId: string,
  checkoutSessionId?: string
) {
  const payment = await prisma.payment.findFirst({
    where: {
      ownerType: "ORGANIZATION",
      ownerId: organizationId,
      type: "ORG_ONBOARDING_FEE",
      ...(checkoutSessionId
        ? { stripeCheckoutSessionId: checkoutSessionId }
        : { stripeCheckoutSessionId: { not: null } }),
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!payment?.stripeCheckoutSessionId) return;

  const checkoutSession = await stripe.checkout.sessions.retrieve(
    payment.stripeCheckoutSessionId
  );
  const isPaid =
    checkoutSession.payment_status === "paid" ||
    checkoutSession.status === "complete";

  if (!isPaid) return;

  await prisma.$transaction([
    prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: { not: "SUCCEEDED" },
      },
      data: {
        status: "SUCCEEDED",
        paidAt: new Date(),
        stripePaymentIntentId:
          typeof checkoutSession.payment_intent === "string"
            ? checkoutSession.payment_intent
            : payment.stripePaymentIntentId,
      },
    }),
    prisma.organization.update({
      where: { id: organizationId },
      data: {
        onboardingFeeStatus: "PAID",
        onboardingFeePaidAt: new Date(),
        status: "APPROVED",
      },
    }),
  ]);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const org = await prisma.organization.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: `${org?.name ? `${org.name}（大会主催者）` : "大会主催者"} | Bluvium`,
  };
}

export default async function OrganizationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    payment?: string;
    session_id?: string;
    tab?: string;
  }>;
}) {
  const { id } = await params;
  const { payment, session_id: sessionId, tab: tabParam } = await searchParams;
  const activeTab = parseOrganizationDetailTab(tabParam);
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  if (payment === "success") {
    try {
      await reconcileOnboardingPayment(id, sessionId);
    } catch (error) {
      console.error("Reconcile onboarding payment failed:", error);
    }
  }

  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      admins: {
        include: {
          user: {
            select: {
              id: true,
              familyName: true,
              givenName: true,
              email: true,
            },
          },
        },
        orderBy: [
          { role: "asc" }, // ADMIN, MEMBER の順
          { createdAt: "asc" },
        ],
      },
      createdBy: {
        select: {
          familyName: true,
          givenName: true,
        },
      },
    },
  });

  const competitionTotalCount = await prisma.competition.count({
    where: { organizationId: id },
  });

  // 大会一覧（直近のみ。件数は competitionTotalCount を参照）
  const competitions = await prisma.competition.findMany({
    where: { organizationId: id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (!organization) {
    notFound();
  }

  // 現在のユーザーの役割を取得
  const userRole = organization.admins.find(
    (admin) => admin.userId === session.userId
  )?.role;

  const isOrgAdmin = isOrgAdminRole(userRole);

  if (!userRole || !isOrgAdmin) {
    redirect("/dashboard");
  }
  const needsOnboardingPayment =
    isOrgAdmin &&
    organization.status === "PENDING" &&
    organization.onboardingFeeStatus !== "PAID";
  const statusLabelMap = {
    PENDING: "仮登録",
    APPROVED: "有効",
    INACTIVE: "停止中",
    SUSPENDED: "凍結中",
    REJECTED: "却下",
  } as const;

  const orgStatusBadgeClass = (status: string) => {
    switch (status) {
      case "APPROVED":
        return "border-emerald-500/35 bg-emerald-500/[0.12] text-emerald-900 dark:text-emerald-100";
      case "PENDING":
        return "border-amber-500/35 bg-amber-500/[0.12] text-amber-900 dark:text-amber-100";
      case "INACTIVE":
        return "border-border bg-muted text-muted-foreground";
      case "SUSPENDED":
        return "border-rose-500/35 bg-rose-500/[0.12] text-rose-900 dark:text-rose-100";
      case "REJECTED":
        return "border-destructive/35 bg-destructive/10 text-destructive";
      default:
        return "border-border bg-muted text-muted-foreground";
    }
  };

  const organizationWebsiteSafeHref = organization.websiteUrl
    ? normalizeOptionalHttpUrl(organization.websiteUrl)
    : null;

  const nameSubtitleParts = [
    organization.nameKana?.trim() || null,
    organization.abbreviation?.trim()
      ? `（${organization.abbreviation.trim()}）`
      : null,
  ].filter(Boolean) as string[];

  const officeAddressParts = [
    organization.postalCode ? `〒${organization.postalCode}` : null,
    [organization.prefecture, organization.city].filter(Boolean).join(""),
    organization.addressLine1?.trim() || null,
    organization.addressLine2?.trim() || null,
  ].filter(Boolean) as string[];
  const officeAddressLine = officeAddressParts.join(" ");

  return (
    <div className="app-page mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {needsOnboardingPayment && (
        <OrganizationOnboardingPaymentBanner
          organizationId={organization.id}
          amount={ORG_ONBOARDING_FEE}
        />
      )}

      <header className="space-y-6">
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            ダッシュボードに戻る
          </Link>
        </Button>

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-muted/40 via-background to-background shadow-sm">
          <div className="space-y-5 p-5 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Landmark className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="text-sm font-medium">大会主催者</span>
                </div>
                <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {organization.name}
                </h1>
                {nameSubtitleParts.length > 0 ? (
                  <p className="text-sm text-muted-foreground">{nameSubtitleParts.join(" · ")}</p>
                ) : null}
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  大会・メンバー・事業情報をまとめて管理します。よく使う操作は下のタブから選べます。
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link href={`/organizations/${organization.id}/edit`}>
                    プロフィールを編集
                    <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
                  </Link>
                </Button>
                {isOrgAdmin ? (
                  <Button size="sm" className="gap-2 shadow-sm" asChild>
                    <Link href={`/organizations/${organization.id}/competitions/create`}>
                      <Plus className="h-4 w-4" aria-hidden />
                      大会を作成
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>

            <div
              className="grid gap-2 border-t border-border/60 pt-5 sm:grid-cols-3"
              role="group"
              aria-label="団体の概要"
            >
              <div className="flex min-h-[3.25rem] flex-col justify-center rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 sm:px-4">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  状態
                </span>
                <span
                  className={cn(
                    "mt-0.5 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                    orgStatusBadgeClass(organization.status)
                  )}
                >
                  {statusLabelMap[organization.status as keyof typeof statusLabelMap] ||
                    organization.status}
                </span>
              </div>
              <div className="flex min-h-[3.25rem] items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 sm:px-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Trophy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </div>
                <div>
                  <span className="text-[11px] font-medium text-muted-foreground">登録大会</span>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {competitionTotalCount.toLocaleString("ja-JP")}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">件</span>
                  </p>
                </div>
              </div>
              <div className="flex min-h-[3.25rem] items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 sm:px-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </div>
                <div>
                  <span className="text-[11px] font-medium text-muted-foreground">メンバー</span>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {organization.admins.length.toLocaleString("ja-JP")}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">名</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <Card className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/15 px-4 py-2.5 sm:px-6">
          <CardTitle className="text-base font-semibold">基本情報</CardTitle>
          <CardDescription className="text-xs">
            ロゴ・連絡先・所在地など、公開ページや大会情報に反映される内容です。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          <div className="bg-muted/10 px-4 py-3 sm:px-6 sm:py-3.5">
            <OrganizationLogoManager
              organizationId={organization.id}
              currentLogoUrl={organization.logoUrl}
              organizationName={organization.name}
              canEdit={true}
            />
          </div>

          <div className="border-t border-border/60 px-4 py-3 sm:px-6 sm:py-3.5">
            <div className="rounded-lg border border-border/70 bg-card/40 p-2 sm:p-2.5">
              <div className="grid gap-1.5 text-sm sm:grid-cols-2 sm:gap-x-3 sm:gap-y-2 lg:grid-cols-3">
                {organization.representativeFamilyName || organization.representativeGivenName ? (
                  <div className="flex min-w-0 items-start gap-1.5">
                    <User className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                    <div className="min-w-0 leading-snug">
                      <span className="text-[11px] font-medium text-muted-foreground">代表者</span>
                      <p className="font-medium text-foreground">
                        {organization.representativeFamilyName} {organization.representativeGivenName}
                      </p>
                    </div>
                  </div>
                ) : null}

                {organization.email ? (
                  <div className="flex min-w-0 items-start gap-1.5">
                    <Mail className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                    <div className="min-w-0 leading-snug">
                      <span className="text-[11px] font-medium text-muted-foreground">メール</span>
                      <div className="mt-0.5 min-w-0">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-auto min-h-6 max-w-full justify-start px-1.5 py-0.5 text-left text-[11px] font-medium"
                        >
                          <a href={`mailto:${organization.email}`} className="break-all">
                            {organization.email}
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {organization.phoneNumber ? (
                  <div className="flex min-w-0 items-start gap-1.5">
                    <Phone className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                    <div className="min-w-0 leading-snug">
                      <span className="text-[11px] font-medium text-muted-foreground">電話</span>
                      <p className="tabular-nums font-medium text-foreground">{organization.phoneNumber}</p>
                    </div>
                  </div>
                ) : null}

                <div className="flex min-w-0 items-start gap-1.5">
                  <Users className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                  <div className="leading-snug">
                    <span className="text-[11px] font-medium text-muted-foreground">メンバー</span>
                    <p className="font-medium text-foreground">{organization.admins.length}名</p>
                  </div>
                </div>

                {organization.establishedYear ? (
                  <div className="flex min-w-0 items-start gap-1.5">
                    <Calendar className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                    <div className="leading-snug">
                      <span className="text-[11px] font-medium text-muted-foreground">設立年</span>
                      <p className="tabular-nums font-medium text-foreground">
                        {organization.establishedYear}年
                      </p>
                    </div>
                  </div>
                ) : null}

                {organization.websiteUrl ? (
                  <div className="flex min-w-0 items-start gap-1.5 sm:col-span-2 lg:col-span-1">
                    <Globe className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                    <div className="min-w-0 leading-snug">
                      <span className="text-[11px] font-medium text-muted-foreground">ウェブサイト</span>
                      <div className="mt-0.5 min-w-0">
                        {organizationWebsiteSafeHref ? (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-auto min-h-6 max-w-full justify-start px-1.5 py-0.5 text-left text-[11px] font-medium"
                          >
                            <a
                              href={organizationWebsiteSafeHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all"
                            >
                              {organization.websiteUrl.replace(/^https?:\/\//, "")}
                            </a>
                          </Button>
                        ) : (
                          <span className="block break-all text-sm font-medium text-foreground">
                            {organization.websiteUrl}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {officeAddressLine ? (
                <div className="mt-2.5 flex min-w-0 items-start gap-1.5 border-t border-border/50 pt-2.5">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                  <div className="min-w-0 leading-snug">
                    <span className="text-[11px] font-medium text-muted-foreground">事務局所在地</span>
                    <p className="text-xs font-medium leading-snug text-foreground sm:text-sm">{officeAddressLine}</p>
                  </div>
                </div>
              ) : null}

              {organization.description ? (
                <div className="mt-2.5 border-t border-border/50 pt-2.5">
                  <span className="text-[11px] font-medium text-muted-foreground">団体について</span>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground sm:text-sm">
                    {organization.description}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <OrganizationDetailTabsClient activeTab={activeTab}>
          <div className="sticky top-[calc(var(--safe-area-top,0px)+0.5rem)] z-10 -mx-4 border-y border-border/60 bg-background/95 px-4 py-2 backdrop-blur-md sm:static sm:mx-0 sm:rounded-xl sm:border sm:bg-muted/35 sm:px-1.5 sm:py-1.5 sm:backdrop-blur-none">
            <TabsList
              className="flex h-auto w-full items-stretch gap-1 overflow-x-auto bg-transparent p-0"
              aria-label="団体管理の区分"
            >
              <TabsTrigger
                value="competitions"
                className="min-w-[8.5rem] flex-1 gap-1.5 rounded-lg px-2 py-2 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-sm"
              >
                <Trophy className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                <span>大会管理</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground data-[state=active]:bg-background">
                  {competitionTotalCount}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="members"
                className="min-w-[7.5rem] flex-1 gap-1.5 rounded-lg px-2 py-2 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-sm"
              >
                <Users className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                <span>メンバー</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {organization.admins.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="business"
                className="min-w-[7.5rem] flex-1 gap-1.5 rounded-lg px-2 py-2 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-sm"
              >
                <Landmark className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                <span>事業パネル</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 大会管理タブ */}
          <TabsContent value="competitions" className="space-y-6 pt-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-primary">
                  <Trophy className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  <span className="text-sm font-medium">大会一覧</span>
                </div>
                <h2 className="text-lg font-semibold text-foreground">登録済みの大会</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  行をクリックすると各大会の編集・公開設定・エントリー状況へ進みます。
                </p>
              </div>
              {isOrgAdmin ? (
                <Button className="shrink-0 gap-2" asChild>
                  <Link href={`/organizations/${organization.id}/competitions/create`}>
                    <Plus className="h-4 w-4" aria-hidden />
                    大会を作成
                  </Link>
                </Button>
              ) : null}
            </div>

            <Card className="overflow-hidden border-border/90 shadow-sm">
              <CardHeader className="border-b border-border/60 bg-muted/15 px-4 py-4 sm:px-6">
                <CardTitle className="text-base font-semibold">
                  大会{" "}
                  <span className="tabular-nums">
                    {competitionTotalCount.toLocaleString("ja-JP")}
                  </span>
                  件
                  {competitionTotalCount > competitions.length ? (
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      直近 {competitions.length} 件を表示しています（作成日の新しい順）
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                {competitions.length > 0 ? (
                  <div className="space-y-3">
                    {competitions.map((competition) => (
                      <CompetitionListItem
                        key={competition.id}
                        competition={competition}
                        organizationId={organization.id}
                        canEdit={isOrgAdmin}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/90 bg-muted/20 px-6 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Trophy className="h-6 w-6" strokeWidth={1.5} aria-hidden />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">まだ大会がありません</p>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      大会を作成すると、ここに一覧表示され、公開ページやエントリー設定を進められます。
                    </p>
                    {isOrgAdmin ? (
                      <Button className="mt-6 gap-2" asChild>
                        <Link href={`/organizations/${organization.id}/competitions/create`}>
                          <Plus className="h-4 w-4" aria-hidden />
                          大会を作成
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* メンバータブ */}
          <TabsContent value="members" className="space-y-6 pt-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                <span className="text-sm font-medium">管理者・メンバー</span>
              </div>
              <h2 className="text-lg font-semibold text-foreground">団体へのアクセス</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                主催団体の管理権限を持つユーザーの一覧です。招待やロール変更はここから行えます。
              </p>
            </div>
            <Card className="overflow-hidden border-border/90 shadow-sm">
              <CardHeader className="border-b border-border/60 bg-muted/15 px-4 py-4 sm:px-6">
                <CardTitle className="text-base font-semibold">
                  メンバー {organization.admins.length} 名
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  管理者は大会作成や設定変更が可能です。
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <MemberManagementWrapper
                  organizationId={organization.id}
                  members={organization.admins}
                  userRole={userRole}
                  currentUserId={session.userId}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="business" className="space-y-6 pt-2">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">事業パネル</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                収支や事業に関する情報をまとめて確認できます。
              </p>
            </div>
            <OrganizationBusinessPanelTabContent
              organizationId={organization.id}
              isOrgAdmin={isOrgAdmin}
            />
          </TabsContent>
        </OrganizationDetailTabsClient>
      </div>
    </div>
  );
}
