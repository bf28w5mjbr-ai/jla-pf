export function getCompetitionStatusLabel(status: string) {
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

export function getCompetitionStatusBadgeClass(status: string) {
  switch (status) {
    case "PUBLISHED":
      return "border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "DRAFT":
      return "border-transparent bg-muted text-muted-foreground";
    case "ONGOING":
      return "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "COMPLETED":
      return "border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "CANCELLED":
      return "border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}
