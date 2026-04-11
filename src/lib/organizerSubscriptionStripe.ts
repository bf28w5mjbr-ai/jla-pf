import type Stripe from "stripe";
import type { OrganizerSubscriptionStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { stripe } from "@/lib/stripe";

function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): OrganizerSubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    case "unpaid":
      return "CANCELED";
    case "incomplete":
    case "incomplete_expired":
      return "INCOMPLETE";
    default:
      return "INCOMPLETE";
  }
}

export async function syncOrganizerSubscriptionFromStripeSubscription(
  sub: Stripe.Subscription
): Promise<void> {
  const orgId = sub.metadata?.organizationId;
  if (!orgId) return;
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      organizerSubscriptionId: sub.id,
      organizerSubscriptionStatus: mapStripeSubscriptionStatus(sub.status),
      organizerSubscriptionCurrentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null,
    },
  });
}

/**
 * Checkout 完了時: 主催団体の年額サブスクと有効化を確定する
 */
export async function finalizeOrganizerSubscriptionCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<void> {
  if (session.mode !== "subscription") return;
  if (session.metadata?.type !== "ORG_PLATFORM_SUBSCRIPTION") return;
  const orgId = session.metadata?.ownerId;
  if (!orgId || typeof orgId !== "string") return;

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  if (customerId) {
    await prisma.organization.update({
      where: { id: orgId },
      data: { stripeCustomerId: customerId },
    });
  }

  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId);
    await syncOrganizerSubscriptionFromStripeSubscription(sub);
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      onboardingFeeStatus: "PAID",
      onboardingFeePaidAt: new Date(),
      status: "APPROVED",
    },
  });
}
