export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { safeServerErrorLog } from "@/lib/safeServerLog";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { logAuditAction } from "@/lib/auditLog";
import { finalizeEntryCheckoutSessionsFromStripeSession } from "@/lib/entryCheckoutStripeFinalize";
import { applyStripeDisputeToEntryCheckoutSessions } from "@/lib/entryCheckoutStripeDispute";
import {
  finalizeOrganizerSubscriptionCheckoutSession,
  syncOrganizerSubscriptionFromStripeSubscription,
} from "@/lib/organizerSubscriptionStripe";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function getOrCreateStripeEvent(event: Stripe.Event) {
  try {
    const record = await prisma.stripeEvent.create({
      data: {
        eventId: event.id,
        type: event.type,
        accountId: event.account ?? null,
        livemode: event.livemode,
        data: toJsonValue(event.data),
      },
      select: { id: true },
    });
    return { id: record.id, alreadyProcessed: false };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.stripeEvent.findUnique({
        where: { eventId: event.id },
        select: { id: true, status: true },
      });
      if (!existing) throw error;
      if (existing.status === "PROCESSED") {
        return { id: existing.id, alreadyProcessed: true };
      }
      await prisma.stripeEvent.update({
        where: { id: existing.id },
        data: {
          status: "RECEIVED",
          errorMessage: null,
          data: toJsonValue(event.data),
        },
      });
      return { id: existing.id, alreadyProcessed: false };
    }
    throw error;
  }
}

function extractPaymentIntentId(
  ref: string | Stripe.PaymentIntent | null | undefined
): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

async function markStripeEventProcessed(id: string) {
  await prisma.stripeEvent.update({
    where: { id },
    data: { status: "PROCESSED", processedAt: new Date() },
  });
}

async function markStripeEventFailed(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  await prisma.stripeEvent.update({
    where: { id },
    data: {
      status: "FAILED",
      processedAt: new Date(),
      errorMessage: message.slice(0, 1000),
    },
  });
}

async function updatePaymentByCheckoutSession(session: Stripe.Checkout.Session) {
  const paymentIntentId = extractPaymentIntentId(session.payment_intent);
  const paidAt = session.created
    ? new Date(session.created * 1000)
    : new Date();
  const updateData: Prisma.PaymentUpdateManyMutationInput = {
    status: "SUCCEEDED",
    paidAt,
    stripeCheckoutSessionId: session.id ?? undefined,
    stripePaymentIntentId: paymentIntentId ?? undefined,
  };

  if (session.metadata?.paymentId) {
    await prisma.payment.updateMany({
      where: { id: session.metadata.paymentId },
      data: updateData,
    });
    return;
  }

  if (session.id) {
    await prisma.payment.updateMany({
      where: { stripeCheckoutSessionId: session.id },
      data: updateData,
    });
    return;
  }

  if (paymentIntentId) {
    const payment = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!payment) return;
    await prisma.payment.update({
      where: { id: payment.id },
      data: updateData,
    });
  }
}

async function markOrganizationOnboardingPaid(
  paymentWhere: Prisma.PaymentWhereInput
) {
  const payments = await prisma.payment.findMany({
    where: {
      ...paymentWhere,
      ownerType: "ORGANIZATION",
      type: { in: ["ORG_ONBOARDING_FEE", "ORG_PLATFORM_SUBSCRIPTION"] },
      status: "SUCCEEDED",
    },
    select: {
      ownerId: true,
      paidAt: true,
    },
  });

  if (payments.length === 0) return;

  await Promise.all(
    payments.map((payment) =>
      prisma.organization.update({
        where: { id: payment.ownerId },
        data: {
          onboardingFeeStatus: "PAID",
          onboardingFeePaidAt: payment.paidAt ?? new Date(),
          status: "APPROVED",
        },
      })
    )
  );
}

async function expireEntryCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<Array<{ id: string; entryId: string | null; competitionId: string }>> {
  const conditions: Prisma.EntryCheckoutSessionWhereInput[] = [];
  if (session.id) {
    conditions.push({ stripeCheckoutSessionId: session.id });
  }
  if (session.metadata?.entryCheckoutSessionId) {
    conditions.push({ id: session.metadata.entryCheckoutSessionId });
  }
  if (conditions.length === 0) return [];

  const targets = await prisma.entryCheckoutSession.findMany({
    where: { OR: conditions },
    select: {
      id: true,
      entryId: true,
      competitionId: true,
    },
  });

  await prisma.entryCheckoutSession.updateMany({
    where: { OR: conditions },
    data: {
      status: "EXPIRED",
      expiredAt: new Date(),
    },
  });
  return targets;
}

async function updatePaymentByPaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
  status: "SUCCEEDED" | "FAILED"
) {
  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: paymentIntent.id },
    data: {
      status,
      paidAt:
        status === "SUCCEEDED"
          ? new Date(paymentIntent.created * 1000)
          : undefined,
    },
  });

  if (status === "SUCCEEDED") {
    await markOrganizationOnboardingPaid({
      stripePaymentIntentId: paymentIntent.id,
    });
  }
}

async function updatePaymentByRefund(charge: Stripe.Charge) {
  const paymentIntentId = extractPaymentIntentId(charge.payment_intent);
  if (!paymentIntentId) return;

  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: paymentIntentId },
    data: { status: "REFUNDED" },
  });
}

async function updatePaymentByDispute(
  dispute: Stripe.Dispute,
  eventType: "charge.dispute.created" | "charge.dispute.closed"
) {
  const paymentIntentId = extractPaymentIntentId(
    (dispute as { payment_intent?: string | Stripe.PaymentIntent | null })
      .payment_intent
  );
  if (!paymentIntentId) return;

  const disputeId = dispute.id;

  if (eventType === "charge.dispute.created") {
    await prisma.payment.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: "DISPUTED", stripeDisputeId: disputeId },
    });
    return;
  }

  let status: "DISPUTED" | "REFUNDED" | "SUCCEEDED" = "DISPUTED";
  if (dispute.status === "won") status = "SUCCEEDED";
  if (dispute.status === "lost") status = "REFUNDED";

  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: paymentIntentId },
    data: {
      status,
      stripeDisputeId: dispute.status === "won" ? null : disputeId,
    },
  });
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe-Signature header." },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    safeServerErrorLog(
      "POST api/webhooks/stripe/route.ts",
      new Error("STRIPE_WEBHOOK_SECRET not configured")
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let event: Stripe.Event;
  let rawBody: string;
  try {
    rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json(
      { error: "Invalid Stripe webhook signature." },
      { status: 400 }
    );
  }

  const record = await getOrCreateStripeEvent(event);
  if (record.alreadyProcessed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await updatePaymentByCheckoutSession(session);
        await finalizeOrganizerSubscriptionCheckoutSession(session);
        const paymentIntentId = extractPaymentIntentId(session.payment_intent);
        const conditions: Prisma.PaymentWhereInput[] = [];
        if (session.id) {
          conditions.push({ stripeCheckoutSessionId: session.id });
        }
        if (paymentIntentId) {
          conditions.push({ stripePaymentIntentId: paymentIntentId });
        }
        if (session.metadata?.paymentId) {
          conditions.push({ id: session.metadata.paymentId });
        }
        if (conditions.length > 0) {
          await markOrganizationOnboardingPaid({ OR: conditions });
        }
        const completedEntrySessions =
          await finalizeEntryCheckoutSessionsFromStripeSession(session);
        await Promise.all(
          completedEntrySessions.map((entrySession) =>
            logAuditAction({
              action: "COMPETITION_ENTRY_PAYMENT_CONFIRMED",
              actorType: "SYSTEM",
              actorKey: "system:stripe_webhook",
              targetType: "EntryCheckoutSession",
              targetId: entrySession.id,
              targetKey: `competition:${entrySession.competitionId}`,
              metadata: {
                entryCheckoutSessionId: entrySession.id,
                entryId: entrySession.entryId,
                competitionId: entrySession.competitionId,
                stripeEventId: event.id,
                stripeCheckoutSessionId: session.id ?? null,
              },
              result: "SUCCESS",
            })
          )
        );
        break;
      }
      /** 遅延決済が実際に成功したとき。completed 時点が unpaid だったエントリーはここで COMPLETED になる。 */
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await updatePaymentByCheckoutSession(session);
        await finalizeOrganizerSubscriptionCheckoutSession(session);
        const paymentIntentId = extractPaymentIntentId(session.payment_intent);
        const conditions: Prisma.PaymentWhereInput[] = [];
        if (session.id) {
          conditions.push({ stripeCheckoutSessionId: session.id });
        }
        if (paymentIntentId) {
          conditions.push({ stripePaymentIntentId: paymentIntentId });
        }
        if (session.metadata?.paymentId) {
          conditions.push({ id: session.metadata.paymentId });
        }
        if (conditions.length > 0) {
          await markOrganizationOnboardingPaid({ OR: conditions });
        }
        const asyncEntrySessions =
          await finalizeEntryCheckoutSessionsFromStripeSession(session);
        await Promise.all(
          asyncEntrySessions.map((entrySession) =>
            logAuditAction({
              action: "COMPETITION_ENTRY_PAYMENT_CONFIRMED",
              actorType: "SYSTEM",
              actorKey: "system:stripe_webhook",
              targetType: "EntryCheckoutSession",
              targetId: entrySession.id,
              targetKey: `competition:${entrySession.competitionId}`,
              metadata: {
                entryCheckoutSessionId: entrySession.id,
                entryId: entrySession.entryId,
                competitionId: entrySession.competitionId,
                stripeEventId: event.id,
                stripeCheckoutSessionId: session.id ?? null,
                source: "checkout.session.async_payment_succeeded",
              },
              result: "SUCCESS",
            })
          )
        );
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const paymentIntentId = extractPaymentIntentId(session.payment_intent);
        const conditions: Prisma.PaymentWhereInput[] = [];
        if (session.id) {
          conditions.push({ stripeCheckoutSessionId: session.id });
        }
        if (paymentIntentId) {
          conditions.push({ stripePaymentIntentId: paymentIntentId });
        }
        if (session.metadata?.paymentId) {
          conditions.push({ id: session.metadata.paymentId });
        }
        if (conditions.length > 0) {
          await prisma.payment.updateMany({
            where: { OR: conditions },
            data: { status: "FAILED" },
          });
        }
        await expireEntryCheckoutSession(session);
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await updatePaymentByPaymentIntent(paymentIntent, "SUCCEEDED");
        break;
      }
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await updatePaymentByPaymentIntent(paymentIntent, "FAILED");
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await updatePaymentByRefund(charge);
        break;
      }
      case "charge.dispute.created":
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        await updatePaymentByDispute(dispute, event.type);
        await applyStripeDisputeToEntryCheckoutSessions(dispute, event.type);
        break;
      }
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        if (account.id) {
          await prisma.organization.updateMany({
            where: { stripeConnectAccountId: account.id },
            data: { stripeConnectChargesEnabled: account.charges_enabled === true },
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncOrganizerSubscriptionFromStripeSubscription(sub);
        break;
      }
      default:
        break;
    }

    await markStripeEventProcessed(record.id);
  } catch (error) {
    await markStripeEventFailed(record.id, error);
    return jsonInternalError500("POST api/webhooks/stripe/route.ts", error);
  }

  return NextResponse.json({ received: true });
}
