/**
 * 大会エントリーの年齢条件用。
 * 年度は「4月2日始まり」: 年度 N は日本暦（Asia/Tokyo）で N年4月2日〜N+1年4月1日（いずれも含む）。
 * 満年齢は開催開始日が属する年度の末日＝翌年4月1日時点で数える。
 */

export function getJapanCalendarDateParts(d: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  let year = 0;
  let month = 0;
  let day = 0;
  for (const p of formatter.formatToParts(d)) {
    if (p.type === "year") year = Number(p.value);
    else if (p.type === "month") month = Number(p.value);
    else if (p.type === "day") day = Number(p.value);
  }
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  return { year, month, day };
}

export function calculateJapanCalendarAge(
  birth: { year: number; month: number; day: number },
  asOf: { year: number; month: number; day: number }
): number {
  let age = asOf.year - birth.year;
  if (asOf.month < birth.month || (asOf.month === birth.month && asOf.day < birth.day)) {
    age--;
  }
  return age;
}

/** 瞬間が属する「4月2日始まり」の年度ラベル N（期間は N/4/2〜N+1/4/1） */
export function eligibilityFiscalYearLabelApril2Start(instant: Date): number {
  const { year, month, day } = getJapanCalendarDateParts(instant);
  if (month > 4 || (month === 4 && day >= 2)) return year;
  return year - 1;
}

export function getCompetitionEligibilityAgeYears(
  dateOfBirth: Date,
  competitionStartDate: Date
): number {
  const birth = getJapanCalendarDateParts(dateOfBirth);
  const fy = eligibilityFiscalYearLabelApril2Start(competitionStartDate);
  const asOf = { year: fy + 1, month: 4, day: 1 };
  return calculateJapanCalendarAge(birth, asOf);
}
