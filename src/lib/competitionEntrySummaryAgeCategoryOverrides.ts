/** エントリー集計の AGEカテゴリ別件数表示用。DB 上のレンジが重なっている大会向けの暫定補正。 */

export const KANAGAWA28_COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";

function utcCalendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export type AgeCategoryBirthDateRange = {
  id: string;
  name: string;
  displayOrder: number;
  eligibleBirthDateFrom: Date | null;
  eligibleBirthDateTo: Date | null;
};

/**
 * 集計表示に使う生年月日レンジ。大会ごとの補正がなければ入力をそのまま返す。
 */
export function resolveAgeCategoriesForEntrySummaryCount<T extends AgeCategoryBirthDateRange>(
  competitionId: string,
  categories: readonly T[]
): readonly T[] {
  if (competitionId !== KANAGAWA28_COMPETITION_ID) return categories;

  return categories.map((c) => {
    if (c.name === "オープン") {
      return {
        ...c,
        eligibleBirthDateTo: utcCalendarDate(2005, 4, 1),
      };
    }
    if (c.name === "U-18") {
      return {
        ...c,
        eligibleBirthDateFrom: utcCalendarDate(2005, 4, 2),
        eligibleBirthDateTo: utcCalendarDate(2011, 4, 1),
      };
    }
    return c;
  });
}
