/**
 * Stripe カード決済手数料（Connect 分含む）を請求総額でカバーする上乗せ率を basis points で指定する。
 * 例: 400 = 4.0%。環境変数 STRIPE_PROCESSING_FEE_BPS（0〜9999、未設定時 400）。
 */
export function getStripeProcessingFeeBpsFromEnv(): number {
  const raw = process.env.STRIPE_PROCESSING_FEE_BPS;
  const n = raw !== undefined && raw !== "" ? Number.parseInt(raw, 10) : 400;
  if (!Number.isFinite(n) || n < 0 || n >= 10000) return 400;
  return n;
}

/**
 * 参加費 B に対する決済手数料上乗せ S（円・切り上げ）。グロスアップ式 S = B×bps/(10000−bps) で請求総額に手数料率が乗る前提に合わせる。
 * Checkout では参加費と別 line item にする。
 */
export function stripeProcessingFeeSurchargeYenFromBps(baseYen: number, bps: number): number {
  if (baseYen <= 0 || bps <= 0) return 0;
  if (bps >= 10000) return baseYen;
  return Math.ceil((baseYen * bps) / (10000 - bps));
}
