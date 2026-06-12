import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function CompetitionSubheading({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

const accentLineClass = {
  orange: "from-orange-500/75 via-orange-400/30 to-transparent",
  emerald: "from-emerald-500/75 via-emerald-400/30 to-transparent",
  muted: "from-foreground/20 via-foreground/8 to-transparent",
} as const;

export function CompetitionEditorialSection({
  subheading,
  title,
  titleExtra,
  children,
  className,
  variant = "panel",
  accent = "muted",
}: {
  subheading: string;
  title: ReactNode;
  titleExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "panel" | "flat";
  accent?: "orange" | "emerald" | "muted";
}) {
  const header = (
    <div className={titleExtra ? "flex flex-wrap items-start justify-between gap-3" : undefined}>
      <div className="min-w-0">
        <CompetitionSubheading>{subheading}</CompetitionSubheading>
        <div
          className={cn(
            "mt-1.5 font-semibold tracking-tight text-foreground",
            variant === "flat" ? "text-lg sm:text-[1.125rem]" : "text-base"
          )}
        >
          {title}
        </div>
      </div>
      {titleExtra}
    </div>
  );

  if (variant === "flat") {
    return (
      <section
        className={cn(
          "relative pb-12 last:pb-0",
          "[&:not(:first-child)]:pt-14 sm:[&:not(:first-child)]:pt-16",
          "[&:not(:first-child)]:before:pointer-events-none [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-0 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-gradient-to-r [&:not(:first-child)]:before:from-border/70 [&:not(:first-child)]:before:via-border/25 [&:not(:first-child)]:before:to-transparent",
          className
        )}
      >
        <div className="flex gap-4 sm:gap-5">
          <div
            className={cn(
              "mt-1.5 w-0.5 shrink-0 self-stretch rounded-full bg-gradient-to-b",
              accentLineClass[accent]
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1 space-y-5">
            {header}
            <div>{children}</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <CompetitionEditorialPanel accent={accent} className={className}>
      {header}
      <div className="mt-4">{children}</div>
    </CompetitionEditorialPanel>
  );
}

export function CompetitionFlatField({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-3.5 py-4", className)}>
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-border/55 bg-muted/20 text-muted-foreground shadow-sm">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <div className="mt-1.5 text-sm leading-relaxed text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function CompetitionEditorialPanel({
  children,
  className,
  accent = "orange",
}: {
  children: ReactNode;
  className?: string;
  accent?: "orange" | "emerald" | "muted";
}) {
  const accentClass =
    accent === "orange"
      ? "from-orange-500/70 via-orange-400/30"
      : accent === "emerald"
        ? "from-emerald-500/70 via-emerald-400/30"
        : "from-border/80 via-border/40";

  const hoverClass =
    accent === "orange"
      ? "hover:border-orange-200/70 hover:bg-orange-50/20 dark:hover:border-orange-900/45 dark:hover:bg-orange-950/10"
      : accent === "emerald"
        ? "hover:border-emerald-200/70 hover:bg-emerald-50/20 dark:hover:border-emerald-900/45 dark:hover:bg-emerald-950/10"
        : "";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/55 bg-background/70 px-5 py-5 sm:px-6 sm:py-6",
        "transition-[border-color,background-color] duration-200",
        hoverClass,
        className
      )}
    >
      {accent !== "muted" ? (
        <div
          className={cn(
            "pointer-events-none absolute -right-10 -top-10 size-28 rounded-full",
            accent === "emerald" ? "bg-emerald-500/8 dark:bg-emerald-400/6" : "bg-orange-500/8 dark:bg-orange-400/6"
          )}
          aria-hidden
        />
      ) : null}
      <div
        className={cn(
          "absolute bottom-5 left-0 top-5 w-0.5 rounded-full bg-gradient-to-b to-transparent sm:bottom-6 sm:top-6",
          accentClass
        )}
        aria-hidden
      />
      <div className="relative pl-3 sm:pl-4">{children}</div>
    </div>
  );
}

export function CompetitionFact({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground">{label}</p>
        {value ? (
          <p className="mt-0.5 text-sm font-medium leading-snug text-foreground sm:text-[0.9375rem]">
            {value}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
