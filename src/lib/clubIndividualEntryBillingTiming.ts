/**
 * クラブが「個人エントリー分」をまとめて払う場合の請求タイミング（解決結果の型）。
 *
 * 運用は **常に即時（INSTANT_PREPAID）** に統一する。個人分はチーム請求に含め、クラブが決済したあと
 * 本人の個人エントリーでカード決済を省略する（枠・相殺は clubPrepaidIndividualSlots 等を参照）。
 *
 * `POST_CLOSE_INVOICE` は型および分岐の後方互換のため残すが、{@link resolveClubIndividualEntryBillingTiming} は返さない。
 */

export type ClubIndividualEntryBillingTiming = "INSTANT_PREPAID" | "POST_CLOSE_INVOICE";

/** 参加費 JSON の形に関わらず、クラブによる個人分は即時（チーム決済に含む）扱いとする。 */
export function resolveClubIndividualEntryBillingTiming(
  _entryFee: unknown
): ClubIndividualEntryBillingTiming {
  return "INSTANT_PREPAID";
}
