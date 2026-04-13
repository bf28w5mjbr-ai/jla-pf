import { jsonInternalError500 } from "@/lib/apiInternalError";
import { stripeRedirectOrigin } from "@/lib/appBaseUrl";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { absoluteAppUrl, appRoutes } from "@/lib/appRoutes";
import { prisma } from "@/server/db";
import { createPaymentCheckout } from "@/lib/stripe";
import { applicationFeeAmountYen } from "@/lib/platformFee";
import {
  getStripeProcessingFeeBpsFromEnv,
  stripeProcessingFeeSurchargeYenFromBps,
} from "@/lib/stripeProcessingFee";
import { connectRequirementSkipped, paidEntryCheckoutBlockReason } from "@/lib/organizerBilling";
import { refreshOrganizationStripeConnectFlags } from "@/lib/organizerStripeConnect";
import { buildTeamEntryPaymentOwnerId, parseTeamEntryPaymentMetadata } from "@/lib/teamEntryPayments";
import { isClubAdminRole } from "@/lib/roleScopes";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const PAYABLE_STATUSES = new Set(["PENDING", "FAILED", "EXPIRED"]);

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;

  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const clubId = typeof body.clubId === "string" ? body.clubId : "";
    if (!clubId) {
      return NextResponse.json({ message: "クラブが不正です" }, { status: 400 });
    }

    const [competition, membership] = await Promise.all([
      prisma.competition.findUnique({
        where: { id: competitionId },
        select: {
          id: true,
          name: true,
          organizationId: true,
          entryStartDate: true,
          entryEndDate: true,
        },
      }),
      prisma.membership.findFirst({
        where: {
          userId: session.userId,
          clubId,
          status: "APPROVED",
        },
        select: {
          role: true,
          club: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    const now = new Date();
    const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
    const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
    const entryWindowOpen =
      entryStart !== null &&
      entryEnd !== null &&
      now >= entryStart &&
      now <= entryEnd;

    if (!membership || !isClubAdminRole(membership.role)) {
      return NextResponse.json({ message: "クラブ管理者権限が必要です" }, { status: 403 });
    }

    const ownerId = buildTeamEntryPaymentOwnerId(competitionId, clubId);
    const payment = await prisma.payment.findUnique({
      where: {
        ownerType_ownerId_type: {
          ownerType: "CLUB",
          ownerId,
          type: "COMPETITION_ENTRY_FEE",
        },
      },
      select: {
        id: true,
        amount: true,
        status: true,
        metadata: true,
      },
    });

    if (!payment) {
      return NextResponse.json(
        {
          message:
            "請求データがありません。チームエントリーを保存してからお試しください。エントリー期間外の場合は、主催者の請求確定後に決済できます。",
        },
        { status: 400 }
      );
    }

    const metadata = parseTeamEntryPaymentMetadata(payment.metadata);
    const canPayWithoutFinalize = entryWindowOpen;
    if (!metadata.finalizedAt && !canPayWithoutFinalize) {
      return NextResponse.json(
        {
          message:
            "エントリー期間外のため、主催者による請求確定後に決済できます。期間中は確定なしで決済できます。",
        },
        { status: 400 }
      );
    }

    if (payment.amount <= 0) {
      return NextResponse.json({ message: "決済対象の金額がありません" }, { status: 400 });
    }

    if (!PAYABLE_STATUSES.has(payment.status)) {
      if (payment.status === "SUCCEEDED") {
        return NextResponse.json({ message: "この請求は支払い済みです" }, { status: 400 });
      }
      return NextResponse.json({ message: "現在この請求は決済できません" }, { status: 400 });
    }

    await refreshOrganizationStripeConnectFlags(competition.organizationId);
    const orgBilling = await prisma.organization.findUnique({
      where: { id: competition.organizationId },
      select: {
        onboardingFeeStatus: true,
        organizerSubscriptionStatus: true,
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
      },
    });
    const paidBlock = orgBilling
      ? paidEntryCheckoutBlockReason(orgBilling)
      : "主催団体の決済設定を確認できませんでした。";
    if (paidBlock) {
      return NextResponse.json({ message: paidBlock }, { status: 403 });
    }

    const payer = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true },
    });

    const origin = stripeRedirectOrigin();
    const entryHubPath = appRoutes.clubs.competition.team(clubId, competitionId, {
      tab: "entry",
    });
    const skipConnect = connectRequirementSkipped();
    const baseYen = payment.amount; // チーム参加費（カード手数料行を除く）
    const processingFeeBps = getStripeProcessingFeeBpsFromEnv();
    const processingFeeYen = stripeProcessingFeeSurchargeYenFromBps(baseYen, processingFeeBps);
    const checkoutTotalYen = baseYen + processingFeeYen;
    const platformFeeOnBase = applicationFeeAmountYen(baseYen); // PF は参加費ベースのみ
    const applicationFeeWithProcessing = platformFeeOnBase + processingFeeYen;

    const checkoutSession = await createPaymentCheckout({
      organizationId: competition.organizationId,
      userId: session.userId,
      amount: checkoutTotalYen,
      description: `チームエントリー費: ${competition.name} / ${membership.club.name}`,
      lineItemSplit:
        processingFeeYen > 0
          ? {
              primaryProductName: `チームエントリー費: ${competition.name} / ${membership.club.name}`,
              entryYen: baseYen,
              processingFeeYen,
            }
          : undefined,
      customerEmail: payer?.email ?? null,
      destinationConnectAccountId: skipConnect ? null : orgBilling?.stripeConnectAccountId ?? null,
      applicationFeeAmountYen: skipConnect ? null : applicationFeeWithProcessing,
      successUrl: `${absoluteAppUrl(origin, entryHubPath)}&payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${absoluteAppUrl(origin, entryHubPath)}&payment=cancel`,
      metadata: {
        type: "COMPETITION_ENTRY_FEE",
        ownerType: "CLUB",
        ownerId,
        competitionId,
        clubId,
        userId: session.userId,
        paymentId: payment.id,
        scope: "TEAM_ENTRY",
        entryFeeYen: String(baseYen),
        processingFeeYen: String(processingFeeYen),
        processingFeeBps: String(processingFeeBps),
      },
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        userId: session.userId,
        status: "PENDING",
        stripeCheckoutSessionId: checkoutSession.id,
      },
    });

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
      paymentId: payment.id,
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/team-billing/checkout/route.ts", error);
  }
}
