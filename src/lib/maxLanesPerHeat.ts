/**
 * 1レースあたりの最大レーン数（maxLanesPerHeat / preliminaryHeatLaneCount）の検証。
 * ラウンド数・ヒート数の上限（32 / 64）とは別ルール。
 */

/** 1 以上かつ safe integer の最大レーン数。無効なら undefined */
export function parseMaxLanesPerHeat(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const n = Math.floor(raw);
  if (n < 1 || !Number.isSafeInteger(n)) return undefined;
  return n;
}

/** 同上。無効なら null（API の「未設定」と区別する用途向け） */
export function parseMaxLanesPerHeatOrNull(raw: unknown): number | null {
  return parseMaxLanesPerHeat(raw) ?? null;
}
