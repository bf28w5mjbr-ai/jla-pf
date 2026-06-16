import { cn } from "@/lib/utils";

export function getCompetitionStatusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "下書き";
    case "PUBLISHED":
      return "公開中";
    case "ONGOING":
      return "開催中";
    case "COMPLETED":
      return "終了";
    case "CANCELLED":
      return "中止";
    default:
      return status;
  }
}

export function getCompetitionStatusBadgeClass(status: string): string {
  switch (status) {
    case "PUBLISHED":
      return "border-emerald-500/35 bg-emerald-500/[0.12] text-emerald-900 dark:text-emerald-100";
    case "DRAFT":
      return "border-border bg-muted/80 text-muted-foreground";
    case "ONGOING":
      return "border-primary/40 bg-primary/10 text-primary";
    case "COMPLETED":
      return "border-violet-500/35 bg-violet-500/[0.12] text-violet-900 dark:text-violet-100";
    case "CANCELLED":
      return "border-destructive/35 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function getCompetitionTypeLabel(competitionType: string | null): string {
  if (competitionType === "A") return "A級";
  if (competitionType === "B") return "B級";
  return "未付与";
}

export function competitionStatusBadgeClassName(status: string): string {
  return cn(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium sm:text-sm",
    getCompetitionStatusBadgeClass(status)
  );
}
