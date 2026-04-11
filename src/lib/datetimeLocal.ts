/** 大会エントリー期間など、管理画面で扱う日時の壁時計（SSR と端末で一致させる） */
export const COMPETITION_ADMIN_DATE_TIME_ZONE = "Asia/Tokyo";

export type DatetimeLocalFormatOptions = {
  /** IANA（例: Asia/Tokyo）。省略時は実行環境のローカル暦・ローカル時刻 */
  timeZone?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatYmdHmInTimeZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(d));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const y = map.year;
  const m = map.month;
  const day = map.day;
  const h = map.hour;
  const min = map.minute;
  if (!y || !m || !day || h === undefined || min === undefined) return "";
  return `${y}-${m}-${day}T${h}:${min}`;
}

/**
 * `<input type="datetime-local" />` 用の値（秒なし）。
 * `toISOString().slice(0, 16)` は UTC になるため使わない。
 * `timeZone` を指定すると SSR（UTC ホスト）とブラウザで同じ壁時計になる。
 */
export function formatDateForDatetimeLocalInput(
  d: Date,
  options?: DatetimeLocalFormatOptions
): string {
  if (options?.timeZone) {
    return formatYmdHmInTimeZone(d, options.timeZone);
  }
  const pad = pad2;
  const x = new Date(d);
  const y = x.getFullYear();
  const m = pad(x.getMonth() + 1);
  const day = pad(x.getDate());
  const h = pad(x.getHours());
  const min = pad(x.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

export type DatetimeLocalParseOptions = {
  /** IANA。`Asia/Tokyo` のときは JST 壁時計として解釈。省略時は実行環境のローカル暦で解釈 */
  timeZone?: string;
};

const DATETIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * `datetime-local` の値（オフセットなし）を UTC の ISO 8601 に直す。
 * - `timeZone: Asia/Tokyo` … 日本時間の数字として解釈（推奨・SSR と一致）
 * - 未指定 … `Date(y,m-1,d,h,min)` でローカル壁時計（`Date.parse` のブラウザ差を避ける）
 */
export function datetimeLocalInputValueToUtcIsoString(
  localValue: string,
  options?: DatetimeLocalParseOptions
): string | null {
  const v = localValue.trim();
  if (!v) return null;
  const m = DATETIME_LOCAL_RE.exec(v);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const min = Number(m[5]);
  const sec = m[6] != null ? Number(m[6]) : 0;
  if (![y, mo, d, h, min, sec].every((n) => Number.isFinite(n))) return null;
  if (options?.timeZone === COMPETITION_ADMIN_DATE_TIME_ZONE) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${pad2(sec)}+09:00`;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  }
  if (options?.timeZone) {
    return null;
  }
  const dt = new Date(y, mo - 1, d, h, min, sec, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/** 公開画面向けの短い日付（例: 2025/4/12） */
export function formatCompactJaDate(d: Date): string {
  return new Date(d).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

/**
 * 開催期間表示。同一暦日なら1日分のみ（例: 4/12）。複数日なら「4/12 〜 4/14」。
 */
export function formatCompactJaDateRange(start: Date, end: Date | null | undefined): string {
  const s = new Date(start);
  if (end == null) {
    return formatCompactJaDate(s);
  }
  const e = new Date(end);
  const sameCalendarDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();
  if (sameCalendarDay) {
    return formatCompactJaDate(s);
  }
  return `${formatCompactJaDate(s)} 〜 ${formatCompactJaDate(e)}`;
}
