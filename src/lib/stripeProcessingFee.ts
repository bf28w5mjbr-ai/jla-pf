/**
 * Stripe が徴収するカード決済手数料に相当する上乗せ（支払人負担）の目安を、参加費に対する basis points で指定する。
 * 例: 360 = 3.6%。環境変数 STRIPE_PROCESSING_FEE_BPS（0〜10000、未設定時 360）。
 */
export function getStripeProcessingFeeBpsFromEnv(): number {
  const raw = process.env.STRIPE_PROCESSING_FEE_BPS;
  const n = raw !== undefined && raw !== "" ? Number.parseInt(raw, 10) : 360;
  if (!Number.isFinite(n) || n < 0 || n > 10000) return 360;
  return n;
}

/**
 * 参加費ベースに対する「カード決済手数料相当」の上乗せ額（円・切り上げ）。Checkout では参加費と別 line item にする。
 */
export function stripeProcessingFeeSurchargeYenFromBps(baseYen: number, bps: number): number {
  if (baseYen <= 0 || bps <= 0) return 0;
  return Math.ceil((baseYen * bps) / 10000);
}
