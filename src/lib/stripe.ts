import Stripe from "stripe";
import { stripeCheckoutCardPaymentMethodOptions } from "@/lib/stripeCheckoutGuards";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn("STRIPE_SECRET_KEY is not configured; Stripe API calls may fail.");
}

const stripeMaxNetworkRetries = Number(process.env.STRIPE_MAX_NETWORK_RETRIES ?? "2");
const stripeTimeoutMs = Number(process.env.STRIPE_TIMEOUT_MS ?? "10000");

const stripe = new Stripe(stripeSecretKey ?? "sk_test_missing_stripe_secret_key", {
  apiVersion: "2025-02-24.acacia",
  maxNetworkRetries: Number.isFinite(stripeMaxNetworkRetries) ? stripeMaxNetworkRetries : 2,
  timeout: Number.isFinite(stripeTimeoutMs) ? stripeTimeoutMs : 10000,
});

export async function createPaymentCheckout(params: {
  organizationId: string;
  userId: string;
  amount: number;
  description?: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  /** アカウントのメールを Checkout に事前入力 */
  customerEmail?: string | null;
  /** Stripe Connect: エントリー代の送金先。指定時は applicationFeeAmountYen も渡す */
  destinationConnectAccountId?: string | null;
  /** PF 手数料（円）。Connect 未使用時は無視 */
  applicationFeeAmountYen?: number | null;
}) {
  const destination = params.destinationConnectAccountId?.trim() || null;
  const fee =
    params.applicationFeeAmountYen != null && Number.isFinite(params.applicationFeeAmountYen)
      ? Math.max(0, Math.floor(params.applicationFeeAmountYen))
      : null;
  const useConnect =
    Boolean(destination) && params.amount > 0 && fee != null && connectPayoutsEnabled();

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData | undefined =
    useConnect && destination
      ? {
          application_fee_amount: fee,
          transfer_data: { destination },
        }
      : undefined;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    payment_method_options: stripeCheckoutCardPaymentMethodOptions,
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: {
            name: params.description || "Organization Onboarding Fee",
          },
          unit_amount: params.amount,
        },
        quantity: 1,
      },
    ],
    ...(params.customerEmail ? { customer_email: params.customerEmail } : {}),
    metadata: params.metadata,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    ...(paymentIntentData ? { payment_intent_data: paymentIntentData } : {}),
  });

  return session;
}

function connectPayoutsEnabled(): boolean {
  return process.env.STRIPE_CONNECT_SKIP_REQUIREMENT !== "true";
}

export function organizerYearlySubscriptionAmountYen(): number {
  const n = Number.parseInt(process.env.STRIPE_ORGANIZER_YEARLY_AMOUNT ?? "10000", 10);
  return Number.isFinite(n) && n > 0 ? n : 10000;
}

/**
 * 主催団体向けプラットフォーム年額（Stripe Checkout / subscription）
 */
export async function createOrganizerSubscriptionCheckout(params: {
  organizationId: string;
  userId: string;
  customerEmail?: string | null;
  stripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}) {
  const yearly = organizerYearlySubscriptionAmountYen();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    payment_method_options: stripeCheckoutCardPaymentMethodOptions,
    ...(params.stripeCustomerId
      ? { customer: params.stripeCustomerId }
      : params.customerEmail
        ? { customer_email: params.customerEmail }
        : {}),
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: {
            name: "主催団体プラットフォーム利用料（年額）",
          },
          unit_amount: yearly,
          recurring: { interval: "year" },
        },
        quantity: 1,
      },
    ],
    metadata: params.metadata,
    subscription_data: {
      metadata: {
        organizationId: params.organizationId,
      },
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  return session;
}

export { stripe };
