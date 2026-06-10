import type { ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { DashboardKeywordTag } from "./DashboardKeywordTag";
import { cn } from "@/lib/utils";

export function DashboardViewMoreLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-3 border-b border-transparent pb-0.5 text-sm font-medium tracking-wide text-foreground transition-colors hover:border-foreground/30",
        className
      )}
    >
      <span>{children}</span>
      <span className="flex size-8 items-center justify-center rounded-full border border-border/80 transition-colors group-hover:border-foreground/30 group-hover:bg-muted/40">
        <ArrowRight
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}

export function DashboardRecordCard({
  title,
  tags,
  titleAttr,
}: {
  title: string;
  tags: Array<{ label: string; sublabel?: string }>;
  titleAttr?: string;
}) {
  return (
    <li
      className="rounded-2xl border border-border/70 bg-gradient-to-br from-card/90 via-card/70 to-muted/20 p-5 shadow-sm transition-colors hover:border-border"
      title={titleAttr}
    >
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <DashboardKeywordTag key={`${tag.label}-${tag.sublabel ?? ""}`} sublabel={tag.sublabel}>
            {tag.label}
          </DashboardKeywordTag>
        ))}
      </div>
      <h3 className="mt-4 text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg">
        {title}
      </h3>
    </li>
  );
}

function CreditCardList({ children }: { children: ReactNode }) {
  return <ul className="grid gap-4 sm:gap-5">{children}</ul>;
}

export function DashboardProfileHeroCreditBlock({
  label,
  showSectionLabel = true,
  itemCount,
  collapseWhenMoreThan,
  preview,
  visibleItems,
  hiddenItems,
  addHref,
  addLabel,
  empty,
}: {
  label: string;
  showSectionLabel?: boolean;
  itemCount: number;
  collapseWhenMoreThan: number;
  preview: string;
  visibleItems: ReactNode[];
  hiddenItems: ReactNode[];
  addHref: string;
  addLabel: string;
  empty: ReactNode;
}) {
  const useCollapse = itemCount > collapseWhenMoreThan && itemCount > 0;

  if (itemCount === 0) {
    return (
      <div className="space-y-6">
        {showSectionLabel ? <span className="sr-only">{label}</span> : null}
        <p className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-sm leading-relaxed text-muted-foreground">
          {empty}
        </p>
        <DashboardViewMoreLink href={addHref}>{addLabel}</DashboardViewMoreLink>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {showSectionLabel ? <span className="sr-only">{label}</span> : null}

      {useCollapse ? (
        <details className="group space-y-4">
          <summary className="cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
            <CreditCardList>{visibleItems}</CreditCardList>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-muted/25 px-4 py-3">
              <p className="text-xs leading-relaxed text-muted-foreground">{preview}</p>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              />
            </div>
          </summary>
          <CreditCardList>{hiddenItems}</CreditCardList>
        </details>
      ) : (
        <CreditCardList>{visibleItems}</CreditCardList>
      )}

      <DashboardViewMoreLink href={addHref}>{addLabel}</DashboardViewMoreLink>
    </div>
  );
}
