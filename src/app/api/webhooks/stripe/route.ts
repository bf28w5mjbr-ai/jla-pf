export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

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

  if (conditions.length === 0) return;

  const paidAt = session.created
    ? new Date(session.created * 1000)
    : new Date();

  const updateData: Prisma.PaymentUpdateManyMutationInput = {
    status: "SUCCEEDED",
    paidAt,
  };
  if (paymentIntentId) updateData.stripePaymentIntentId = paymentIntentId;
  if (session.id) updateData.stripeCheckoutSessionId = session.id;

  await prisma.payment.updateMany({
    where: { OR: conditions },
    data: updateData,
  });
}

async function updateEntryCheckoutSession(
  session: Stripe.Checkout.Session
) {
  const conditions: Prisma.EntryCheckoutSessionWhereInput[] = [];
  if (session.id) {
    conditions.push({ stripeCheckoutSessionId: session.id });
  }
  if (session.metadata?.entryCheckoutSessionId) {
    conditions.push({ id: session.metadata.entryCheckoutSessionId });
  }
  if (conditions.length === 0) return;

  await prisma.entryCheckoutSession.updateMany({
    where: { OR: conditions },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });
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

  let status: "DISPUTED" | "REFUNDED" | "SUCCEEDED" = "DISPUTED";
  if (eventType === "charge.dispute.closed") {
    if (dispute.status === "won") status = "SUCCEEDED";
    if (dispute.status === "lost") status = "REFUNDED";
  }

  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: paymentIntentId },
    data: { status },
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
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  let event: Stripe.Event;
  let rawBody: string;
  try {
    rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
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
        await updateEntryCheckoutSession(session);
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
        break;
      }
      default:
        break;
    }

    await markStripeEventProcessed(record.id);
  } catch (error) {
    await markStripeEventFailed(record.id, error);
    return NextResponse.json(
      { error: "Failed to process Stripe webhook." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
