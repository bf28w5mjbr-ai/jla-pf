export function formatCareerDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function officialCompetitionTypeLabel(type: string | null): string {
  if (type === "A") return "A級";
  if (type === "B") return "B級";
  return "種別未設定";
}

export function officialCompetitionTypeClass(type: string | null): string {
  if (type === "A") {
    return "border-sky-200/70 bg-sky-500/10 text-sky-900 dark:border-sky-900/50 dark:bg-sky-500/15 dark:text-sky-200";
  }
  if (type === "B") {
    return "border-violet-200/70 bg-violet-500/10 text-violet-900 dark:border-violet-900/50 dark:bg-violet-500/15 dark:text-violet-200";
  }
  return "border-border/70 bg-muted/40 text-muted-foreground";
}

export function attendanceMethodClass(method: string): string {
  if (method === "NFC") {
    return "border-orange-200/70 bg-orange-500/10 text-orange-900 dark:border-orange-900/50 dark:bg-orange-500/15 dark:text-orange-200";
  }
  return "border-border/70 bg-muted/35 text-muted-foreground";
}

export function podiumRankVisual(rank: number): {
  label: string;
  className: string;
} {
  switch (rank) {
    case 1:
      return {
        label: "1",
        className:
          "border-amber-300/80 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-950 shadow-sm dark:border-amber-700/60 dark:from-amber-950/80 dark:to-amber-900/40 dark:text-amber-100",
      };
    case 2:
      return {
        label: "2",
        className:
          "border-slate-300/80 bg-gradient-to-br from-slate-100 to-slate-50 text-slate-800 shadow-sm dark:border-slate-600/60 dark:from-slate-800/80 dark:to-slate-900/40 dark:text-slate-100",
      };
    case 3:
      return {
        label: "3",
        className:
          "border-orange-300/70 bg-gradient-to-br from-orange-100 to-orange-50 text-orange-950 shadow-sm dark:border-orange-800/60 dark:from-orange-950/70 dark:to-orange-900/35 dark:text-orange-100",
      };
    default:
      return {
        label: String(rank),
        className: "border-border/70 bg-muted/40 text-foreground",
      };
  }
}
