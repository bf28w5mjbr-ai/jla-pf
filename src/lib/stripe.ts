import Stripe from 'stripe';
import { stripeCheckoutCardPaymentMethodOptions } from '@/lib/stripeCheckoutGuards';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn("STRIPE_SECRET_KEY is not configured; Stripe API calls may fail.");
}

const stripeMaxNetworkRetries = Number(process.env.STRIPE_MAX_NETWORK_RETRIES ?? "2");
const stripeTimeoutMs = Number(process.env.STRIPE_TIMEOUT_MS ?? "10000");

const stripe = new Stripe(stripeSecretKey ?? "sk_test_missing_stripe_secret_key", {
  apiVersion: '2025-02-24.acacia',
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
}) {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    payment_method_options: stripeCheckoutCardPaymentMethodOptions,
    line_items: [
      {
        price_data: {
          currency: 'jpy',
          product_data: {
            name: params.description || 'Organization Onboarding Fee',
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
  });

  return session;
}

export { stripe };
