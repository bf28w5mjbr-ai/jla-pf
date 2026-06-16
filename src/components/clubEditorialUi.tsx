"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
export {
  OrgEditorialPanel,
  OrgSubheading,
} from "@/app/(authenticated)/organizations/[id]/_components/organizationEditorialUi";

export function ClubEditorialLoadingState({ label }: { label: string }) {
  return (
    <div
      className="rounded-2xl border border-border/55 bg-background/70 px-4 py-3 sm:px-5"
      role="status"
      aria-label={label}
    >
      <div className="space-y-2">
        <div className="h-3 w-16 animate-pulse rounded bg-muted-foreground/10" />
        <div className="h-10 animate-pulse rounded-lg bg-muted/25" />
      </div>
    </div>
  );
}

export function ClubEditorialEmptyState({
  message,
}: {
  icon?: LucideIcon;
  message: string;
}) {
  return (
    <p className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-5 text-center text-xs text-muted-foreground">
      {message}
    </p>
  );
}

export function ClubEditorialItemCard({
  children,
  className,
  pinned = false,
}: {
  children: ReactNode;
  className?: string;
  pinned?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border bg-card/80 px-4 py-4 shadow-sm transition-colors sm:px-5 sm:py-5",
        pinned
          ? "border-orange-300/60 ring-1 ring-orange-500/15 dark:border-orange-800/50"
          : "border-border/55 hover:border-border/80",
        className
      )}
    >
      {children}
    </article>
  );
}

export function ClubEditorialFormPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/55 bg-muted/15 px-4 py-4 sm:px-5 sm:py-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export const clubSelectClassName = cn(
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm",
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
);
