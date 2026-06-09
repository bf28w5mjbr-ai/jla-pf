import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { safeServerErrorLog } from "@/lib/safeServerLog";

export const STRIPE_BALANCE_TRANSACTION_FEE_PAYLOAD_KEY = "stripeBalanceTransactionFeeYen";
export const STRIPE_BALANCE_TRANSACTION_FEE_SYNCED_AT_KEY =
  "stripeBalanceTransactionFeeSyncedAt";

function feeFromBalanceTransaction(
  balanceTransaction: string | Stripe.BalanceTransaction | null | undefined
): number | null {
  if (!balanceTransaction || typeof balanceTransaction === "string") return null;
  const fee = balanceTransaction.fee;
  return typeof fee === "number" && Number.isFinite(fee) && fee >= 0 ? fee : null;
}

/** PaymentIntent の latest_charge.balance_transaction.fee（円）を取得 */
export async function fetchStripeBalanceTransactionFeeYen(
  paymentIntentId: string
): Promise<number | null> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = pi.latest_charge;
    if (!charge || typeof charge === "string") return null;
    return feeFromBalanceTransaction(charge.balance_transaction);
  } catch (error) {
    safeServerErrorLog("fetchStripeBalanceTransactionFeeYen", error);
    return null;
  }
}

export function parseStripeBalanceTransactionFeeYen(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = (payload as Record<string, unknown>)[STRIPE_BALANCE_TRANSACTION_FEE_PAYLOAD_KEY];
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
}
