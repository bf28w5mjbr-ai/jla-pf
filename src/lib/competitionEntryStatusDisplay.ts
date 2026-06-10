export function getEntryDeadlineSuffix(
  now: Date,
  entryStart: Date | null,
  entryEnd: Date | null
): string | null {
  if (!entryEnd) return null;

  if (entryStart && now < entryStart) {
    const diffMs = entryStart.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 1) return `受付開始まであと${diffDays}日`;
    if (diffDays === 1) return "受付開始まであと1日";
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
    return diffHours > 0 ? `受付開始まであと${diffHours}時間` : "まもなく受付開始";
  }

  if (now > entryEnd) return null;

  const diffMs = entryEnd.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 1) return `締切まであと${diffDays}日`;
  if (diffDays === 1) return "締切まであと1日";
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffHours > 0) return `締切まであと${diffHours}時間`;
  return "まもなく締切";
}

export function buildEntryStatusLabel(
  now: Date,
  entryStart: Date | null,
  entryEnd: Date | null
): { label: string; tone: "open" | "upcoming" | "closed" | "unset" } {
  if (!entryStart || !entryEnd) {
    return { label: "エントリー期間未設定", tone: "unset" };
  }

  const isEntryOpen = now >= entryStart && now <= entryEnd;
  const isEntryUpcoming = now < entryStart;
  const base = isEntryOpen
    ? "エントリー受付中"
    : isEntryUpcoming
      ? "エントリー準備中"
      : "エントリー終了";
  const suffix = getEntryDeadlineSuffix(now, entryStart, entryEnd);
  const label = suffix ? `${base}（${suffix}）` : base;

  return {
    label,
    tone: isEntryOpen ? "open" : isEntryUpcoming ? "upcoming" : "closed",
  };
}

export function entryStatusBadgeClass(tone: "open" | "upcoming" | "closed" | "unset"): string {
  switch (tone) {
    case "open":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "upcoming":
      return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
    case "closed":
      return "border-border bg-muted/80 text-muted-foreground";
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}
