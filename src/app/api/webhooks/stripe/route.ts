// app/api/webhooks/stripe/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/src/server/db"; // ← Prismaシングルトン（前メッセで案内済み）

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-10-29.clover" });
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("no_signature", { status: 400 });
  const body = await req.text(); // 必ず raw で

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err: any) {
    console.error("❌ Bad signature:", err.message);
    return new NextResponse("bad_signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const entryId = (session.metadata?.entryId ?? "") as string;
        const competitionId = (session.metadata?.competitionId ?? "") as string;

        // PaymentIntent を取得して金額/手数料/charge を確定
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;

        const pi = paymentIntentId
          ? await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["charges"] })
          : null;

        const charge = pi?.charges?.data?.[0];
        const amount = (pi?.amount ?? session.amount_total ?? 0) | 0;
        const appFee = (pi?.application_fee_amount ?? 0) | 0;
        const transferGroup = pi?.transfer_group ?? competitionId ?? undefined;

        await prisma.$transaction(async (tx) => {
          const entry = await tx.entry.findUnique({ where: { id: entryId } });
          if (!entry) throw new Error(`Entry not found: ${entryId}`);

          // Payment を upsert（PI基準）
          await tx.payment.upsert({
            where: { stripePaymentIntentId: paymentIntentId ?? "none" },
            update: {
              status: "SUCCEEDED",
              amount,
              applicationFeeAmount: appFee,
              stripeChargeId: charge?.id ?? null,
              transferGroup: transferGroup ?? null,
              competitionId,
              userId: entry.userId,
              entryId,
            },
            create: {
              status: "SUCCEEDED",
              amount,
              applicationFeeAmount: appFee,
              stripeChargeId: charge?.id ?? null,
              stripePaymentIntentId: paymentIntentId ?? undefined,
              transferGroup,
              competitionId,
              userId: entry.userId,
              entryId,
            },
          });

          // Entry を PAID
          await tx.entry.update({
            where: { id: entryId },
            data: { status: "PAID" },
          });

          await tx.auditLog.create({
            data: {
              action: "CHECKOUT_COMPLETED",
              target: entryId,
              meta: { sessionId: session.id, paymentIntentId },
            },
          });
        });

        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;

        const payment = await prisma.payment.findUnique({
          where: { stripePaymentIntentId: paymentIntentId ?? "" },
        });

        if (payment) {
          await prisma.$transaction(async (tx) => {
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: "REFUNDED" },
            });
            if (payment.entryId) {
              await tx.entry.update({
                where: { id: payment.entryId },
                data: { status: "REFUNDED" },
              });
            }
            await tx.auditLog.create({
              data: {
                action: "REFUND_SUCCEEDED",
                target: payment.entryId ?? payment.id,
                meta: { chargeId: charge.id },
              },
            });
          });
        }
        break;
      }

      default:
        // 他イベントは無視
        break;
    }

    return new NextResponse("ok", { status: 200 });
  } catch (e: any) {
    console.error("❌ Handler error:", e?.message);
    return NextResponse.json({ error: "handler_error", message: e?.message }, { status: 500 });
  }
}

