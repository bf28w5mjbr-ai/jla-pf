import { getJapanCalendarDateParts } from "@/lib/competitionEligibilityAge";

export type EventBirthDateFields = {
  eligibleBirthDateFrom?: Date | null;
  eligibleBirthDateTo?: Date | null;
  minAge?: number | null;
  maxAge?: number | null;
};

/** DB の @db.Date を暦日（UTC 日付）として読む */
export function calendarDateFromDbDate(d: Date): {
  year: number;
  month: number;
  day: number;
} {
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function compareCal(
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number }
): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/** 種目に生年月日の範囲が指定されているか（この場合は minAge/maxAge より優先） */
export function eventUsesBirthDateRange(event: EventBirthDateFields): boolean {
  return event.eligibleBirthDateFrom != null || event.eligibleBirthDateTo != null;
}

/**
 * 生年月日が種目の「この日〜この日に生まれた人」（両端含む）に入るか。
 * 比較は日本の暦日（Asia/Tokyo）でユーザーの生年月日を解釈する。
 */
export function isUserDobInEventBirthDateRange(
  userDateOfBirth: Date,
  from: Date | null | undefined,
  to: Date | null | undefined
): boolean {
  const dob = getJapanCalendarDateParts(userDateOfBirth);
  if (from != null) {
    const f = calendarDateFromDbDate(from);
    if (compareCal(dob, f) < 0) return false;
  }
  if (to != null) {
    const t = calendarDateFromDbDate(to);
    if (compareCal(dob, t) > 0) return false;
  }
  return true;
}

export function meetsEventAgeOrBirthRule(params: {
  userDateOfBirth: Date | null;
  userEligibilityAgeYears: number | null;
  event: EventBirthDateFields;
}): boolean {
  const { userDateOfBirth, userEligibilityAgeYears, event } = params;

  if (eventUsesBirthDateRange(event)) {
    if (!userDateOfBirth) return false;
    return isUserDobInEventBirthDateRange(
      userDateOfBirth,
      event.eligibleBirthDateFrom,
      event.eligibleBirthDateTo
    );
  }

  if (userEligibilityAgeYears === null) return true;
  if (typeof event.minAge === "number" && userEligibilityAgeYears < event.minAge) return false;
  if (typeof event.maxAge === "number" && userEligibilityAgeYears > event.maxAge) return false;
  return true;
}
