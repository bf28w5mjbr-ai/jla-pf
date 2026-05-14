const TOKYO = "Asia/Tokyo";

/** `startDate` 瞬間が属する JST の暦日（YYYY-MM-DD） */
export function competitionStartCalendarYmdTokyo(startDate: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TOKYO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(startDate);
}

/**
 * クラブページからの TO 直接追加の締切瞬間（UTC）。
 * 開催初日（`startDate` の JST 暦日）の前日の 23:59:59.999 JST まで追加可能。
 */
export function clubDirectTechnicalOfficialAddDeadlineEndUtc(startDate: Date): Date {
  const openYmd = competitionStartCalendarYmdTokyo(startDate);
  const openDayStartJst = new Date(`${openYmd}T00:00:00+09:00`);
  return new Date(openDayStartJst.getTime() - 1);
}

/** `now` が締切以前（端含む）なら true */
export function isClubDirectTechnicalOfficialAddOpen(startDate: Date, now: Date): boolean {
  return now.getTime() <= clubDirectTechnicalOfficialAddDeadlineEndUtc(startDate).getTime();
}
