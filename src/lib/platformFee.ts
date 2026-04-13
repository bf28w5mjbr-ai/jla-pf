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
 * エントリー代のうち「参加費」部分（円）に対する PF 手数料（円、整数）。
 * カード決済手数料の上乗せ行を別 line item にしている場合は、ここに渡すのは参加費のみ（手数料行を含めない）。
 * Connect の `application_fee_amount` に「この値 + カード手数料上乗せ分」を足して渡す。
 */
export function applicationFeeAmountYen(totalYen: number, bps = getPlatformFeeBps()): number {
  if (totalYen <= 0) return 0;
  let fee = Math.round((totalYen * bps) / 10000);
  if (fee < 1) fee = 0;
  if (fee >= totalYen) fee = Math.max(0, totalYen - 1);
  return fee;
}
