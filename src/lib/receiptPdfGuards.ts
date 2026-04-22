/**
 * 領収書 PDF 生成前のガード（DB 不整合や境界値で @react-pdf が落ちないようにする）。
 */

/** 表示・計算用に非負整数円へ正規化する */
export function nonNegativeYenForPdf(value: unknown, fallback: number): number {
  const fb = Number.isFinite(fallback) ? Math.max(0, Math.round(fallback)) : 0;
  if (typeof value !== "number" || !Number.isFinite(value)) return fb;
  return Math.max(0, Math.round(value));
}

/** 発行日として有効な最初の Date を返す（すべて無効なら現在時刻） */
export function coercePdfIssuedDate(
  primary: Date,
  ...fallbacks: readonly (Date | null | undefined)[]
): Date {
  const candidates: Date[] = [
    primary,
    ...fallbacks.filter((d): d is Date => d instanceof Date),
  ];
  for (const d of candidates) {
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
