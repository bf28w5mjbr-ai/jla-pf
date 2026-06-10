import type { CompetitionEntryStatus } from "@prisma/client";

type PaymentTone = "success" | "pending" | "warning" | "muted" | "danger";

export function getDashboardEntryPaymentVisual(args: {
  entryStatus: CompetitionEntryStatus;
  businessEstablished: boolean;
  userLabel: string;
  hasOpenDispute?: boolean;
}): { label: string; tone: PaymentTone } {
  if (args.entryStatus === "CANCELLED") {
    return { label: "取消済み", tone: "muted" };
  }
  if (args.hasOpenDispute) {
    return { label: args.userLabel, tone: "warning" };
  }
  if (args.businessEstablished) {
    return { label: args.userLabel, tone: "success" };
  }
  return { label: args.userLabel, tone: "pending" };
}

export function dashboardEntryPaymentToneClass(tone: PaymentTone): string {
  switch (tone) {
    case "success":
      return "border-emerald-200/80 bg-emerald-50/90 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100";
    case "warning":
      return "border-amber-200/80 bg-amber-50/90 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100";
    case "danger":
      return "border-red-200/80 bg-red-50/90 text-red-900 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-100";
    case "pending":
      return "border-orange-200/70 bg-orange-50/80 text-orange-950 dark:border-orange-900/45 dark:bg-orange-950/30 dark:text-orange-100";
    default:
      return "border-border/70 bg-muted/40 text-muted-foreground";
  }
}

export function getDashboardCompetitionPhaseVisual(status: string): {
  label: string;
  className: string;
} | null {
  switch (status) {
    case "ONGOING":
      return {
        label: "開催中",
        className:
          "border-orange-200/70 bg-orange-500/10 text-orange-800 dark:border-orange-900/50 dark:bg-orange-500/15 dark:text-orange-200",
      };
    case "COMPLETED":
      return {
        label: "終了",
        className:
          "border-violet-200/70 bg-violet-500/10 text-violet-800 dark:border-violet-900/50 dark:bg-violet-500/15 dark:text-violet-200",
      };
    case "PUBLISHED":
      return {
        label: "開催予定",
        className:
          "border-sky-200/70 bg-sky-500/10 text-sky-900 dark:border-sky-900/50 dark:bg-sky-500/15 dark:text-sky-200",
      };
    default:
      return null;
  }
}
