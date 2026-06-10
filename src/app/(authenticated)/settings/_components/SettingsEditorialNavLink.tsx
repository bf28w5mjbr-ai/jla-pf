import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsEditorialNavLink({
  href,
  icon: Icon,
  title,
  description,
  className,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between gap-4 rounded-2xl border border-border/55 bg-background/60 px-4 py-3.5 sm:px-5",
        "transition-colors hover:border-orange-200/60 hover:bg-orange-50/15 dark:hover:border-orange-900/40 dark:hover:bg-orange-950/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/30 text-muted-foreground transition-colors group-hover:border-foreground/20 group-hover:text-foreground">
          <Icon className="size-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <div className="text-xs text-muted-foreground sm:text-sm">{description}</div>
        </div>
      </div>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/80 transition-colors group-hover:border-foreground/30 group-hover:bg-muted/40">
        <ArrowRight
          className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden
        />
      </span>
    </Link>
  );
}
