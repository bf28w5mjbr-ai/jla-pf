import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getRequiredAuthenticatedUserId, verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { organizerYearlySubscriptionAmountYen, stripe } from "@/lib/stripe";
import { finalizeOrganizerSubscriptionCheckoutSession } from "@/lib/organizerSubscriptionStripe";
import {
  connectRequirementSkipped,
  hasOrganizerPlatformSubscription,
} from "@/lib/organizerBilling";
import { refreshOrganizationStripeConnectFlags } from "@/lib/organizerStripeConnect";
import { dashboardSectionClassName } from "@/app/(authenticated)/dashboard/_components/dashboardLayout";
import {
  OrgEditorialPanel,
  OrgFact,
  OrgSubheading,
} from "./_components/organizationEditorialUi";
import { Button } from "@/components/ui/button";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MemberManagementWrapper from "@/components/MemberManagementWrapper";
import OrganizationLogoManager from "@/components/OrganizationLogoManager";
import CompetitionListItem from "@/components/CompetitionListItem";
import OrganizationBusinessPanelTabContent from "@/components/admin/OrganizationBusinessPanelTabContent";
import OrganizationOnboardingPaymentBanner from "@/components/OrganizationOnboardingPaymentBanner";
import OrganizationStripeConnectPanel from "@/components/OrganizationStripeConnectPanel";
import {
  ArrowLeft,
  Calendar,
  Globe,
  Landmark,
  Mail,
  MapPin,
  Phone,
  Plus,
  Settings,
  Trophy,
  Users,
} from "lucide-react";
import { canViewOrganizationDashboardPage } from "@/lib/organizationDashboardAccess";
import { isOrgAdminRole } from "@/lib/roleScopes";
import { normalizeOptionalHttpUrl } from "@/lib/safeExternalUrl";
import { parseOrganizationDetailTab } from "@/lib/organizationDetailTab";
import { cn } from "@/lib/utils";
import OrganizationDetailTabsClient from "@/components/OrganizationDetailTabsClient";

export const dynamic = "force-dynamic";
async function reconcileOnboardingPayment(
  organizationId: string,
  checkoutSessionId?: string
) {
  const payment = await prisma.payment.findFirst({
    where: {
      ownerType: "ORGANIZATION",
      ownerId: organizationId,
      type: { in: ["ORG_ONBOARDING_FEE", "ORG_PLATFORM_SUBSCRIPTION"] },
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

  if (checkoutSession.mode === "subscription") {
    await finalizeOrganizerSubscriptionCheckoutSession(checkoutSession);
    const paymentIntentId =
      typeof checkoutSession.payment_intent === "string"
        ? checkoutSession.payment_intent
        : checkoutSession.payment_intent?.id;
    await prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: { not: "SUCCEEDED" },
      },
      data: {
        status: "SUCCEEDED",
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId ?? undefined,
      },
    });
    return;
  }

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
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);
  if (!session?.userId || !(await canViewOrganizationDashboardPage(id, session.userId))) {
    return { title: "大会主催者 | Bluvium" };
  }

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
    stripe_connect?: string;
    financeCompetition?: string;
  }>;
}) {
  const { id } = await params;
  const {
    payment,
    session_id: sessionId,
    tab: tabParam,
    stripe_connect: stripeConnect,
    financeCompetition,
  } = await searchParams;
  const activeTab =
    financeCompetition != null && financeCompetition.trim() !== ""
      ? "business"
      : parseOrganizationDetailTab(tabParam);
  const userId = await getRequiredAuthenticatedUserId();

  if (payment === "success") {
    try {
      await reconcileOnboardingPayment(id, sessionId);
    } catch (error) {
      console.error("Reconcile onboarding payment failed:", error);
    }
  }

  if (stripeConnect === "return" || stripeConnect === "refresh") {
    try {
      await refreshOrganizationStripeConnectFlags(id);
    } catch (error) {
      console.error("Refresh Stripe Connect flags failed:", error);
    }
  }

  const [orgRow, competitionTotalCount, competitions] = await Promise.all([
    prisma.organization.findUnique({
      where: { id },
      include: {
        admins: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: { select: { familyName: true, givenName: true } },
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
            profile: { select: { familyName: true, givenName: true } },
          },
        },
      },
    }),
    prisma.competition.count({
      where: { organizationId: id },
    }),
    prisma.competition.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  let organization = orgRow;

  if (!organization) {
    notFound();
  }

  // 現在のユーザーの役割を取得
  const userRole = organization.admins.find(
    (admin) => admin.userId === userId
  )?.role;

  const isOrgAdmin = isOrgAdminRole(userRole);
  const isOperational = organization.status === "APPROVED";

  if (!userRole) {
    notFound();
  }

  /** Webhook 未着・オンボ直後の Stripe 側のみ先に有効化、など DB と実状態のズレを解消 */
  if (
    !connectRequirementSkipped() &&
    hasOrganizerPlatformSubscription(organization) &&
    organization.stripeConnectAccountId &&
    !organization.stripeConnectChargesEnabled
  ) {
    try {
      await refreshOrganizationStripeConnectFlags(id);
      const chargesRow = await prisma.organization.findUnique({
        where: { id },
        select: { stripeConnectChargesEnabled: true },
      });
      if (chargesRow) {
        organization = {
          ...organization,
          stripeConnectChargesEnabled: chargesRow.stripeConnectChargesEnabled,
        };
      }
    } catch (error) {
      console.error("Stripe Connect sync on organization page failed:", error);
    }
  }

  const needsOnboardingPayment =
    isOrgAdmin &&
    organization.status === "PENDING" &&
    !hasOrganizerPlatformSubscription(organization);
  const organizerYearlyAmount = organizerYearlySubscriptionAmountYen();
  const showStripeConnectSetup =
    isOrgAdmin &&
    !connectRequirementSkipped() &&
    hasOrganizerPlatformSubscription(organization) &&
    (!organization.stripeConnectAccountId || !organization.stripeConnectChargesEnabled);
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

  const hasPublicProfile =
    organization.email ||
    organization.phoneNumber ||
    organization.establishedYear ||
    organization.websiteUrl ||
    officeAddressLine ||
    organization.description;

  return (
    <div className="flex flex-col">
      {needsOnboardingPayment ? (
        <section className={cn(dashboardSectionClassName, "pt-10 sm:pt-12")}>
          <OrganizationOnboardingPaymentBanner
            organizationId={organization.id}
            amount={organizerYearlyAmount}
          />
        </section>
      ) : null}
      {showStripeConnectSetup ? (
        <section
          className={cn(
            dashboardSectionClassName,
            needsOnboardingPayment ? "pt-4" : "pt-10 sm:pt-12"
          )}
        >
          <OrganizationStripeConnectPanel
            organizationId={organization.id}
            chargesEnabled={organization.stripeConnectChargesEnabled === true}
          />
        </section>
      ) : null}

      <section
        className={cn(
          dashboardSectionClassName,
          "border-b border-border/40 pb-0",
          !needsOnboardingPayment && !showStripeConnectSetup ? "pt-10 sm:pt-12" : "pt-4 sm:pt-5"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard"
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
            ダッシュボードに戻る
          </Link>
          {isOrgAdmin ? (
            <Link
              href={`/organizations/${organization.id}/edit`}
              aria-label="編集"
              className={cn(
                "group inline-flex shrink-0 items-center justify-center p-1 text-muted-foreground",
                "transition-colors hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              <Settings
                className="size-[1.125rem] transition-transform duration-300 group-hover:rotate-90 sm:size-5"
                strokeWidth={1.75}
                aria-hidden
              />
            </Link>
          ) : null}
        </div>
      </section>

      <section
        className={cn(
          dashboardSectionClassName,
          "border-b border-border/40 pb-12 pt-8 sm:pb-16 sm:pt-10"
        )}
      >
        <OrgEditorialPanel accent="orange">
          <OrgSubheading>Organizer</OrgSubheading>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="inline-flex shrink-0 flex-col items-center rounded-2xl border border-border/55 bg-background/80 p-2 shadow-sm">
              <OrganizationLogoManager
                organizationId={organization.id}
                currentLogoUrl={organization.logoUrl}
                organizationName={organization.name}
                canEdit={true}
                variant="compact"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
                {organization.name}
              </h1>
              {nameSubtitleParts.length > 0 ? (
                <p className="text-sm tracking-wide text-muted-foreground">
                  {nameSubtitleParts.join(" · ")}
                </p>
              ) : null}
              {[organization.representativeFamilyName, organization.representativeGivenName].some(
                (s) => s?.trim()
              ) ? (
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">代表者 </span>
                  {[organization.representativeFamilyName, organization.representativeGivenName]
                    .map((s) => s?.trim())
                    .filter(Boolean)
                    .join(" ")}
                </p>
              ) : null}
            </div>
          </div>
        </OrgEditorialPanel>

        {hasPublicProfile ? (
          <OrgEditorialPanel accent="muted" className="mt-5">
            <OrgSubheading>Public profile</OrgSubheading>
            <p className="mt-2 text-sm text-muted-foreground">
              以下は公開ページ・大会情報に反映されます。
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {organization.email ? (
                <OrgFact
                  icon={Mail}
                  label="メール"
                  value={organization.email}
                  href={`mailto:${organization.email}`}
                />
              ) : null}
              {organization.phoneNumber ? (
                <OrgFact
                  icon={Phone}
                  label="電話"
                  value={organization.phoneNumber}
                  mono
                />
              ) : null}
              {organization.establishedYear ? (
                <OrgFact
                  icon={Calendar}
                  label="設立年"
                  value={`${organization.establishedYear}年`}
                />
              ) : null}
              {organization.websiteUrl ? (
                <OrgFact
                  icon={Globe}
                  label="ウェブサイト"
                  value={organization.websiteUrl.replace(/^https?:\/\//, "")}
                  href={organizationWebsiteSafeHref ?? undefined}
                  external={Boolean(organizationWebsiteSafeHref)}
                />
              ) : null}
            </div>
            {officeAddressLine ? (
              <div className="mt-4 border-t border-border/45 pt-4">
                <OrgFact icon={MapPin} label="事務局所在地" value={officeAddressLine} />
              </div>
            ) : null}
            {organization.description ? (
              <div className="mt-4 border-t border-border/45 pt-4">
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
                  団体について
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {organization.description}
                </p>
              </div>
            ) : null}
          </OrgEditorialPanel>
        ) : null}
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
            団体管理
          </h2>
        </div>

        <OrganizationDetailTabsClient activeTab={activeTab}>
          <div
            className={cn(
              "sticky top-[calc(var(--safe-area-top,0px)+2.75rem)] z-20 mb-5 rounded-2xl border border-border/55 bg-background/95 p-1.5 shadow-sm backdrop-blur-md",
              "supports-[backdrop-filter]:bg-background/80 sm:static sm:backdrop-blur-none"
            )}
          >
            <TabsList
              className="flex h-auto w-full items-stretch gap-1 overflow-x-auto bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="団体管理の区分"
            >
              <TabsTrigger
                value="competitions"
                className="min-w-[7.5rem] flex-1 gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs transition-colors hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:min-w-[8.5rem] sm:px-3 sm:py-2.5 sm:text-sm"
              >
                <Trophy className="size-3.5 shrink-0 opacity-80 sm:size-4" aria-hidden />
                <span>大会管理</span>
                <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {competitionTotalCount}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="members"
                className="min-w-[6.5rem] flex-1 gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs transition-colors hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:min-w-[7.5rem] sm:px-3 sm:py-2.5 sm:text-sm"
              >
                <Users className="size-3.5 shrink-0 opacity-80 sm:size-4" aria-hidden />
                <span>メンバー</span>
                <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {organization.admins.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="business"
                className="min-w-[6.5rem] flex-1 gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs transition-colors hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:min-w-[7.5rem] sm:px-3 sm:py-2.5 sm:text-sm"
              >
                <Landmark className="size-3.5 shrink-0 opacity-80 sm:size-4" aria-hidden />
                <span>事業パネル</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="competitions" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground sm:text-lg">登録済みの大会</h3>
              </div>
              {isOrgAdmin && isOperational ? (
                <Button size="sm" className="shrink-0 gap-1.5" asChild>
                  <Link href={`/organizations/${organization.id}/competitions/create`}>
                    <Plus className="size-4" aria-hidden />
                    大会を作成
                  </Link>
                </Button>
              ) : null}
            </div>

            <OrgEditorialPanel accent="orange">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border/45 pb-4">
                <div>
                  <OrgSubheading>Competitions</OrgSubheading>
                  <p className="mt-1 text-base font-semibold text-foreground">
                    <span className="tabular-nums">
                      {competitionTotalCount.toLocaleString("ja-JP")}
                    </span>
                    件
                  </p>
                </div>
                {competitionTotalCount > competitions.length ? (
                  <p className="text-xs text-muted-foreground">
                    直近 {competitions.length} 件（新しい順）
                  </p>
                ) : null}
              </div>

              {competitions.length > 0 ? (
                <div className="space-y-2.5">
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
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/15 px-5 py-12 text-center">
                  <div className="flex size-11 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
                    <Trophy className="size-5" strokeWidth={1.5} aria-hidden />
                  </div>
                  <p className="mt-4 text-sm font-medium text-foreground">まだ大会がありません</p>
                  {isOrgAdmin && isOperational ? (
                    <Button size="sm" className="mt-4 gap-1.5" asChild>
                      <Link href={`/organizations/${organization.id}/competitions/create`}>
                        <Plus className="size-4" aria-hidden />
                        大会を作成
                      </Link>
                    </Button>
                  ) : null}
                </div>
              )}
            </OrgEditorialPanel>
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            <h3 className="text-base font-semibold text-foreground sm:text-lg">メンバー</h3>

            <OrgEditorialPanel accent="emerald">
              <div className="mb-4 border-b border-border/45 pb-4">
                <OrgSubheading>Team</OrgSubheading>
                <p className="mt-1 text-base font-semibold text-foreground">
                  {organization.admins.length} 名
                </p>
              </div>
              <MemberManagementWrapper
                organizationId={organization.id}
                members={organization.admins.map((admin) => ({
                  ...admin,
                  user: {
                    id: admin.user.id,
                    email: admin.user.email,
                    familyName: admin.user.profile?.familyName ?? null,
                    givenName: admin.user.profile?.givenName ?? null,
                  },
                }))}
                userRole={userRole}
                currentUserId={userId}
              />
            </OrgEditorialPanel>
          </TabsContent>

          <TabsContent value="business" className="space-y-4">
            <h3 className="text-base font-semibold text-foreground sm:text-lg">事業パネル</h3>
            <OrganizationBusinessPanelTabContent
              organizationId={organization.id}
              isOrgAdmin={isOrgAdmin}
              expandedFinanceCompetitionId={financeCompetition ?? null}
            />
          </TabsContent>
        </OrganizationDetailTabsClient>
      </section>
    </div>
  );
}
