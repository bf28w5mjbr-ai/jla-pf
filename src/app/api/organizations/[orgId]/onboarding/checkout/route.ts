import { jsonInternalError500 } from "@/lib/apiInternalError";
import { stripeRedirectOrigin } from "@/lib/appBaseUrl";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requireOrgAdmin } from "@/lib/accessControl";
import { createOrganizerSubscriptionCheckout, organizerYearlySubscriptionAmountYen } from "@/lib/stripe";
import {
  assertOnboardingCheckoutCooldown,
  getClientIpFromRequest,
  isStripeCheckoutClientIpBlocked,
  STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE,
} from "@/lib/stripeCheckoutGuards";
import { hasOrganizerPlatformSubscription } from "@/lib/organizerBilling";

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId: organizationId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        status: true,
        onboardingFeeStatus: true,
        organizerSubscriptionStatus: true,
        stripeCustomerId: true,
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "団体が見つかりません" }, { status: 404 });
    }

    if (hasOrganizerPlatformSubscription(organization)) {
      return NextResponse.json({ error: "利用料の登録は既に完了しています" }, { status: 400 });
    }

    const clientIp = getClientIpFromRequest(req);
    if (isStripeCheckoutClientIpBlocked(clientIp)) {
      return NextResponse.json(
        { error: STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE },
        { status: 403 }
      );
    }

    const existingForCooldown = await prisma.payment.findUnique({
      where: {
        ownerType_ownerId_type: {
          ownerType: "ORGANIZATION",
          ownerId: organizationId,
          type: "ORG_PLATFORM_SUBSCRIPTION",
        },
      },
      select: { stripeCheckoutSessionId: true, updatedAt: true },
    });
    try {
      assertOnboardingCheckoutCooldown(existingForCooldown);
    } catch {
      return NextResponse.json(
        { error: STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE },
        { status: 429 }
      );
    }

    const amount = organizerYearlySubscriptionAmountYen();

    const payment = await prisma.payment.upsert({
      where: {
        ownerType_ownerId_type: {
          ownerType: "ORGANIZATION",
          ownerId: organizationId,
          type: "ORG_PLATFORM_SUBSCRIPTION",
        },
      },
      create: {
        ownerType: "ORGANIZATION",
        ownerId: organizationId,
        type: "ORG_PLATFORM_SUBSCRIPTION",
        userId: session.userId,
        status: "PENDING",
        amount,
        metadata: {
          type: "ORG_PLATFORM_SUBSCRIPTION",
          ownerType: "ORGANIZATION",
          ownerId: organizationId,
          userId: session.userId,
        },
      },
      update: {
        status: "PENDING",
        amount,
        metadata: {
          type: "ORG_PLATFORM_SUBSCRIPTION",
          ownerType: "ORGANIZATION",
          ownerId: organizationId,
          userId: session.userId,
        },
      },
    });

    if (payment.status === "SUCCEEDED") {
      return NextResponse.json({ error: "利用料の登録は既に完了しています" }, { status: 400 });
    }

    const payer = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true },
    });

    const origin = stripeRedirectOrigin();
    let checkoutSession;
    try {
      checkoutSession = await createOrganizerSubscriptionCheckout({
        organizationId,
        userId: session.userId,
        customerEmail: payer?.email ?? null,
        stripeCustomerId: organization.stripeCustomerId,
        successUrl: `${origin}/organizations/${organizationId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/organizations/${organizationId}?payment=cancel`,
        metadata: {
          type: "ORG_PLATFORM_SUBSCRIPTION",
          ownerType: "ORGANIZATION",
          ownerId: organizationId,
          userId: session.userId,
          paymentId: payment.id,
        },
      });
    } catch (stripeErr) {
      console.error("Stripe checkout.sessions.create (organizer subscription) failed", stripeErr);
      return NextResponse.json(
        { error: STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE },
        { status: 502 }
      );
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        stripeCheckoutSessionId: checkoutSession.id,
      },
    });

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
      paymentId: payment.id,
    });
  } catch (error) {
    return jsonInternalError500("POST api/organizations/[orgId]/onboarding/checkout/route.ts", error);
  }
}
