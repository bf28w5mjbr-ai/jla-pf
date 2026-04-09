/** 種目の開始時刻のみ（一覧・見出し用） */
export function formatEventStartJa(start: Date | string | null | undefined): string | null {
  if (!start) return null;
  const s = new Date(start);
  return s.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  if (s && e) {
    return `${s.toLocaleString("ja-JP", opts)} 〜 ${e.toLocaleString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (s) return s.toLocaleString("ja-JP", opts);
  return e!.toLocaleString("ja-JP", opts);
}
