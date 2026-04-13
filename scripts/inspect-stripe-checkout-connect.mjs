#!/usr/bin/env node
/**
 * エントリー等の Checkout セッションが Stripe Connect（destination + application fee）になっているか確認する。
 *
 *   node --env-file=.env scripts/inspect-stripe-checkout-connect.mjs cs_test_xxx
 *
 * セッション ID の例:
 * - 決済完了後のリダイレクト URL の `session_id` クエリ
 * - Stripe ダッシュボード → 決済 → 該当 Checkout セッション
 *
 * 期待値（Connect 有効・有料エントリー）:
 * - payment_intent.application_fee_amount が正の整数（円）＝PF 手数料（参加費ベース）＋決済手数料上乗せ
 * - payment_intent.transfer_data.destination が主催団体の Connect アカウント ID（acct_...）
 * - metadata に entryFeeYen / processingFeeYen / processingFeeBps が付く場合あり（内訳確認用）
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY が必要です。例: node --env-file=.env scripts/inspect-stripe-checkout-connect.mjs cs_...");
  process.exit(1);
}

const sessionId = process.argv[2];
if (!sessionId || !sessionId.startsWith("cs_")) {
  console.error(
    "使い方: node --env-file=.env scripts/inspect-stripe-checkout-connect.mjs <checkout_session_id>"
  );
  process.exit(1);
}

const stripe = new Stripe(key, {
  apiVersion: "2025-02-24.acacia",
  maxNetworkRetries: 2,
  timeout: 15000,
});

const session = await stripe.checkout.sessions.retrieve(sessionId, {
  expand: ["payment_intent"],
});

let pi = session.payment_intent;
if (typeof pi === "string") {
  pi = await stripe.paymentIntents.retrieve(pi);
}

if (!pi) {
  console.log(
    JSON.stringify(
      {
        checkoutSessionId: session.id,
        mode: session.mode,
        paymentStatus: session.payment_status,
        note: "PaymentIntent がまだ無い（未決済・セッション放棄など）",
      },
      null,
      2
    )
  );
  process.exit(0);
}

const fee = pi.application_fee_amount;
const dest = pi.transfer_data?.destination ?? null;

const connectUsed = dest != null && dest !== "";
const feeOk = fee != null && Number(fee) > 0;

console.log(
  JSON.stringify(
    {
      checkoutSessionId: session.id,
      mode: session.mode,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      metadata: session.metadata,
      paymentIntentId: pi.id,
      application_fee_amount: fee,
      transfer_destination: dest,
      checks: {
        hasTransferDestination: connectUsed,
        hasApplicationFee: feeOk,
        matchesExpectedConnectFlow: connectUsed && feeOk,
      },
      note:
        connectUsed && feeOk
          ? "OK: Destination 決済。application fee はプラットフォーム、残額は transfer_destination へ。"
          : !connectUsed && !feeOk
            ? "Connect 未使用の可能性（STRIPE_CONNECT_SKIP_REQUIREMENT=true、主催の Connect 未設定、金額0 など）。コード: src/lib/stripe.ts createPaymentCheckout"
            : "要確認: transfer と fee のどちらかのみ。Stripe ダッシュボードの PaymentIntent 詳細も参照。",
    },
    null,
    2
  )
);
