/**
 * クラブが「個人エントリー分」をまとめて払う場合の請求タイミング。
 *
 * - INSTANT_PREPAID: 割当メンバーごとの単価が（生年月日が分かれば）受付中に確定でき、先払い枠と相殺しやすい。
 * - POST_CLOSE_INVOICE: 締切まで総額が確定しない／人数分の単価が事前に立てられないため、締切後のクラブ請求とする。
 */

export type ClubIndividualEntryBillingTiming = "INSTANT_PREPAID" | "POST_CLOSE_INVOICE";

export function resolveClubIndividualEntryBillingTiming(
  entryFee: unknown
): ClubIndividualEntryBillingTiming {
  if (entryFee === null || entryFee === undefined) {
    return "INSTANT_PREPAID";
  }

  if (typeof entryFee === "number") {
    return "POST_CLOSE_INVOICE";
  }

  if (typeof entryFee === "object" && !Array.isArray(entryFee)) {
    const o = entryFee as Record<string, unknown>;
    if (o.clubIndividualBilling === "post_close") return "POST_CLOSE_INVOICE";
    if (o.clubIndividualBilling === "instant") return "INSTANT_PREPAID";
    if (o.individualEntryFeePerEvent === true) return "POST_CLOSE_INVOICE";
  }

  return "INSTANT_PREPAID";
}
