import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../server/db';
import { requireOrgAdmin } from '../../../../../../lib/accessControl';
import { createPaymentCheckout } from '../../../../../../lib/stripe';
import {
  assertOnboardingCheckoutCooldown,
  getClientIpFromRequest,
  isStripeCheckoutClientIpBlocked,
  STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE,
} from '../../../../../../lib/stripeCheckoutGuards';

const DEFAULT_ONBOARDING_FEE = 10000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId: organizationId } = await params;
    const token = req.cookies.get('session')?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        status: true,
        onboardingFeeStatus: true,
      },
    });

    if (!organization) {
      return NextResponse.json({ error: '団体が見つかりません' }, { status: 404 });
    }

    if (organization.onboardingFeeStatus === 'PAID') {
      return NextResponse.json({ error: '登録料は支払い済みです' }, { status: 400 });
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
          ownerType: 'ORGANIZATION',
          ownerId: organizationId,
          type: 'ORG_ONBOARDING_FEE',
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

    const amount = DEFAULT_ONBOARDING_FEE;

    const payment = await prisma.payment.upsert({
      where: {
        ownerType_ownerId_type: {
          ownerType: 'ORGANIZATION',
          ownerId: organizationId,
          type: 'ORG_ONBOARDING_FEE',
        },
      },
      create: {
        ownerType: 'ORGANIZATION',
        ownerId: organizationId,
        type: 'ORG_ONBOARDING_FEE',
        userId: session.userId,
        status: 'PENDING',
        amount,
        metadata: {
          type: 'ORG_ONBOARDING_FEE',
          ownerType: 'ORGANIZATION',
          ownerId: organizationId,
          userId: session.userId,
        },
      },
      update: {
        status: 'PENDING',
        amount,
        metadata: {
          type: 'ORG_ONBOARDING_FEE',
          ownerType: 'ORGANIZATION',
          ownerId: organizationId,
          userId: session.userId,
        },
      },
    });

    if (payment.status === 'SUCCEEDED') {
      return NextResponse.json({ error: '登録料は支払い済みです' }, { status: 400 });
    }

    const payer = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true },
    });

    const origin = new URL(req.url).origin;
    let checkoutSession;
    try {
      checkoutSession = await createPaymentCheckout({
        organizationId,
        userId: session.userId,
        amount,
        description: `団体登録料: ${organization.name}`,
        customerEmail: payer?.email ?? null,
        successUrl: `${origin}/organizations/${organizationId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/organizations/${organizationId}?payment=cancel`,
        metadata: {
          type: 'ORG_ONBOARDING_FEE',
          ownerType: 'ORGANIZATION',
          ownerId: organizationId,
          userId: session.userId,
          paymentId: payment.id,
        },
      });
    } catch (stripeErr) {
      console.error('Stripe checkout.sessions.create (onboarding) failed', stripeErr);
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
