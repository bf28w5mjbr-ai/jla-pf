/**
 * エントリー代に対するプラットフォーム手数料（basis points）。
 * 例: 800 = 8%。環境変数 STRIPE_PLATFORM_FEE_BPS（0〜10000）。
 */
export function getPlatformFeeBps(): number {
  const raw = process.env.STRIPE_PLATFORM_FEE_BPS;
  const n = raw !== undefined && raw !== "" ? Number.parseInt(raw, 10) : 800;
  if (!Number.isFinite(n) || n < 0 || n > 10000) return 800;
  return n;
}

/**
 * 決済総額（円）に対する PF 側 application_fee（円、整数）。
 * Connect 送金時に主催者へは totalYen - fee が振り込まれる想定。
 */
export function applicationFeeAmountYen(totalYen: number, bps = getPlatformFeeBps()): number {
  if (totalYen <= 0) return 0;
  let fee = Math.round((totalYen * bps) / 10000);
  if (fee < 1) fee = 0;
  if (fee >= totalYen) fee = Math.max(0, totalYen - 1);
  return fee;
}
