import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

/**
 * Checkout Session を expand 済みで渡す。
 * PaymentIntent / Charge が文字列 ID のみの場合は receipt_url を取得できない。
 */
export function receiptUrlFromExpandedCheckoutSession(
  session: Stripe.Checkout.Session
): string | null {
  const pi = session.payment_intent;
  if (!pi || typeof pi === "string") return null;
  const charge = pi.latest_charge;
  if (!charge || typeof charge === "string") return null;
  return charge.receipt_url ?? null;
}

export async function fetchStripeReceiptUrlForCheckoutSessionId(
  stripeSessionId: string
): Promise<string | null> {
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId, {
    expand: ["payment_intent.latest_charge"],
  });
  return receiptUrlFromExpandedCheckoutSession(session);
}
