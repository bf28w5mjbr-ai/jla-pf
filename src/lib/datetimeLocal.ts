/**
 * `<input type="datetime-local" />` 用の値（ローカル暦・ローカル時刻、秒なし）。
 * `toISOString().slice(0, 16)` は UTC になるため、管理画面の日時がずれるのを防ぐ。
 */
export function formatDateForDatetimeLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

/**
 * `datetime-local` の値（`YYYY-MM-DDTHH:mm`、オフセットなし）を、実行環境のローカルタイムゾーンとして解釈し UTC の ISO 8601 に直す。
 * ブラウザから API へ送るときに使う。オフセットなし文字列をサーバーで `new Date` するとホスト TZ（例: UTC）で解釈され、画面の日時と DB がずれる。
 */
export function datetimeLocalInputValueToUtcIsoString(localValue: string): string | null {
  const v = localValue.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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
