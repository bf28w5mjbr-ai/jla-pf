import { COMPETITION_ADMIN_DATE_TIME_ZONE } from "@/lib/datetimeLocal";

const SCHEDULE_DISPLAY_TZ = COMPETITION_ADMIN_DATE_TIME_ZONE;

/** 種目の開始時刻のみ（一覧・見出し用） */
export function formatEventStartJa(start: Date | string | null | undefined): string | null {
  if (!start) return null;
  const s = new Date(start);
  return s.toLocaleString("ja-JP", {
    timeZone: SCHEDULE_DISPLAY_TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** タイムスケジュール左カラム用（時刻のみ） */
export function formatEventStartTimeColumnJa(start: Date | string | null | undefined): string | null {
  if (!start) return null;
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return null;
  return s.toLocaleString("ja-JP", {
    timeZone: SCHEDULE_DISPLAY_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 日付見出し用（5/24（土）） */
export function formatScheduleDateHeadingJa(start: Date | string | null | undefined): string | null {
  if (!start) return null;
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return null;
  const datePart = s.toLocaleDateString("ja-JP", {
    timeZone: SCHEDULE_DISPLAY_TZ,
    month: "numeric",
    day: "numeric",
  });
  const weekday = s.toLocaleDateString("ja-JP", {
    timeZone: SCHEDULE_DISPLAY_TZ,
    weekday: "short",
  });
  return `${datePart}（${weekday}）`;
}

export function scheduleDateKeyFromIso(iso: Date | string | null | undefined): string | null {
  if (!iso) return null;
  const s = new Date(iso);
  if (Number.isNaN(s.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_DISPLAY_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(s);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type === "year" || p.type === "month" || p.type === "day") {
      map[p.type] = Number(p.value);
    }
  }
  const { year: y, month: mo, day: d } = map;
  if (y == null || mo == null || d == null) return null;
  return `${y}-${mo - 1}-${d}`;
}

/** 種目の進行日時（表示用・JST ローカル表記） */
export function formatEventScheduleJa(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined
): string | null {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (!s && !e) return null;
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: SCHEDULE_DISPLAY_TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  if (s && e) {
    return `${s.toLocaleString("ja-JP", opts)} 〜 ${e.toLocaleString("ja-JP", { timeZone: SCHEDULE_DISPLAY_TZ, hour: "2-digit", minute: "2-digit" })}`;
  }
  if (s) return s.toLocaleString("ja-JP", opts);
  return e!.toLocaleString("ja-JP", opts);
}
