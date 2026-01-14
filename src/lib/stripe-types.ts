// src/lib/stripe-types.ts
import Stripe from "stripe";

export type PaymentIntentReference = string | Stripe.PaymentIntent | null;

export function extractPaymentIntentId(
  ref: PaymentIntentReference
): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

export function extractRefundId(
  ref: string | Stripe.Refund | null
): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}
