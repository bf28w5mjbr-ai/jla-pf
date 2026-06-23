import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** エントリータブ内の折りたたみブロック（メール・手動エントリー等） */
export const entriesCollapsibleClassName =
  "group min-w-0 overflow-hidden rounded-2xl border border-border/55 bg-background/70 shadow-sm [&_summary::-webkit-details-marker]:hidden";

export const entriesCollapsibleSummaryClassName =
  "flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/25 sm:px-5";

export function EntriesSectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

export function EntriesSectionBlock({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <EntriesSectionLabel>{label}</EntriesSectionLabel>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function EntriesIconBadge({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "amber" | "muted";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200/60 bg-amber-50/80 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
      : tone === "muted"
        ? "border-border/60 bg-muted/30 text-muted-foreground"
        : "border-primary/15 bg-primary/10 text-primary";

  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl border",
        toneClass
      )}
    >
      {children}
    </span>
  );
}

export function EntriesCountBadge({
  count,
  tone = "default",
}: {
  count: number;
  tone?: "default" | "amber" | "muted";
}) {
  if (count <= 0) return null;
  const toneClass =
    tone === "amber"
      ? "border-amber-200/70 bg-amber-50/90 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-100"
      : tone === "muted"
        ? "border-border/60 bg-muted/40 text-muted-foreground"
        : "border-border/60 bg-background text-foreground";

  return (
    <span
      className={cn(
        "inline-flex min-w-[1.75rem] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
        toneClass
      )}
    >
      {count}
    </span>
  );
}
