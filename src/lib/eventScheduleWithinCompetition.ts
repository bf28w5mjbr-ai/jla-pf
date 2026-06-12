import {
  COMPETITION_ADMIN_DATE_TIME_ZONE,
  formatDateForDatetimeLocalInput,
} from "@/lib/datetimeLocal";

const TOKYO = "Asia/Tokyo";

/** DB に入っている Date を、指定 TZ の暦日 YYYY-MM-DD に変換 */
function calendarYmdInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * 大会の開催日（JST の暦日）に基づく、種目の開始・終了に許容する瞬時の範囲（両端含む）。
 * 終了日はその日の 23:59:59.999 JST まで許容する。
 */
export function getCompetitionEventScheduleInclusiveUtcBounds(
  competitionStartDate: Date,
  competitionEndDate: Date
): { minUtc: Date; maxUtc: Date } {
  const startYmd = calendarYmdInTimeZone(competitionStartDate, TOKYO);
  const endYmd = calendarYmdInTimeZone(competitionEndDate, TOKYO);
  const minUtc = new Date(`${startYmd}T00:00:00+09:00`);
  const maxUtc = new Date(`${endYmd}T23:59:59.999+09:00`);
  return { minUtc, maxUtc };
}

export function isInstantWithinCompetitionEventSchedule(
  instant: Date,
  competitionStartDate: Date,
  competitionEndDate: Date
): boolean {
  const { minUtc, maxUtc } = getCompetitionEventScheduleInclusiveUtcBounds(
    competitionStartDate,
    competitionEndDate
  );
  const t = instant.getTime();
  return t >= minUtc.getTime() && t <= maxUtc.getTime();
}

/** API 用。開始・終了のうち null でないものだけ検査 */
export function assertEventScheduleWithinCompetitionRange(
  scheduledStart: Date | null,
  scheduledEnd: Date | null,
  competitionStartDate: Date,
  competitionEndDate: Date
): string | null {
  if (scheduledStart && !isInstantWithinCompetitionEventSchedule(scheduledStart, competitionStartDate, competitionEndDate)) {
    return "開始日時は大会の開催期間内にしてください";
  }
  if (scheduledEnd && !isInstantWithinCompetitionEventSchedule(scheduledEnd, competitionStartDate, competitionEndDate)) {
    return "終了日時は大会の開催期間内にしてください";
  }
  return null;
}

/** `<input type="datetime-local" />` の min / max（端末ローカル表記） */
export function competitionScheduleDatetimeLocalMinMax(
  competitionStartDate: Date,
  competitionEndDate: Date
): { min: string; max: string } {
  const { minUtc, maxUtc } = getCompetitionEventScheduleInclusiveUtcBounds(
    competitionStartDate,
    competitionEndDate
  );
  return {
    min: formatDateForDatetimeLocalInput(minUtc, {
      timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
    }),
    max: formatDateForDatetimeLocalInput(maxUtc, {
      timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
    }),
  };
}
