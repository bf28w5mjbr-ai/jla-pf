const TOKYO = "Asia/Tokyo";
const MAX_COMPETITION_SCHEDULE_DAYS = 62;

export type CompetitionScheduleDay = {
  key: string;
  date: Date;
  label: string;
};

/** JST 暦日 YYYY-MM-DD */
export function calendarDayKeyInTokyo(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TOKYO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** 瞬時を JST 暦日キーに変換（割当日照合用） */
export function dayKeyFromInstant(iso: Date | string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return calendarDayKeyInTokyo(d);
}

function addUtcDays(ymd: string, days: number): string {
  const base = new Date(`${ymd}T00:00:00+09:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return calendarDayKeyInTokyo(base);
}

function formatScheduleDayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  const datePart = d.toLocaleDateString("ja-JP", {
    timeZone: TOKYO,
    month: "numeric",
    day: "numeric",
  });
  const weekday = d.toLocaleDateString("ja-JP", {
    timeZone: TOKYO,
    weekday: "short",
  });
  return `${datePart}（${weekday}）`;
}

/** 大会 startDate〜endDate の JST 暦日一覧（両端含む） */
export function enumerateCompetitionScheduleDays(
  startDate: Date | string,
  endDate: Date | string
): CompetitionScheduleDay[] {
  const startKey = calendarDayKeyInTokyo(new Date(startDate));
  const endKey = calendarDayKeyInTokyo(new Date(endDate));
  const out: CompetitionScheduleDay[] = [];
  let cursor = startKey;
  while (cursor <= endKey && out.length < MAX_COMPETITION_SCHEDULE_DAYS) {
    out.push({
      key: cursor,
      date: new Date(`${cursor}T12:00:00+09:00`),
      label: formatScheduleDayLabel(cursor),
    });
    if (cursor === endKey) break;
    cursor = addUtcDays(cursor, 1);
  }
  return out;
}

export function firstCompetitionScheduleDayKey(
  startDate: Date | string,
  endDate: Date | string
): string {
  const days = enumerateCompetitionScheduleDays(startDate, endDate);
  return days[0]?.key ?? calendarDayKeyInTokyo(new Date(startDate));
}
