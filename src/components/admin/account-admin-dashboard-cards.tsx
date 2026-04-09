import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  href,
  accent,
  emphasize,
}: {
  title: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  href?: string;
  accent: "slate" | "amber" | "emerald" | "orange";
  emphasize?: boolean;
}) {
  const accentRing = {
    slate: "bg-slate-500/10 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300",
    amber: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    orange: "bg-orange-500/10 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
  }[accent];

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p
            className={cn(
              "text-3xl font-semibold tabular-nums tracking-tight text-foreground",
              emphasize && value > 0 && "text-amber-700 dark:text-amber-400"
            )}
          >
            {value.toLocaleString("ja-JP")}
          </p>
          <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
        </div>
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            accentRing
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      {href ? (
        <div className="mt-4 flex items-center text-sm font-medium text-primary">
          <span>詳しく見る</span>
          <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
        </div>
      ) : null}
    </>
  );

  const cardClass =
    "transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  if (href) {
    return (
      <Link href={href} className={cn("block rounded-2xl", cardClass)}>
        <Card className="h-full border-border/90 shadow-sm">{inner}</Card>
      </Link>
    );
  }

  return <Card className={cn("border-border/90 shadow-sm", cardClass)}>{inner}</Card>;
}

export function QuickLinkCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-border/90 bg-card p-5 shadow-sm transition hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <ArrowRight
          className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden
        />
      </div>
    </Link>
  );
}
