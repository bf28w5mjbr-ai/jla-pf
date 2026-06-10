"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DashboardKeywordTag({
  children,
  sublabel,
  className,
}: {
  children: string;
  sublabel?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-col rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-center leading-tight",
        className
      )}
    >
      <span className="text-[11px] font-medium text-foreground">{children}</span>
      {sublabel ? (
        <span className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          {sublabel}
        </span>
      ) : null}
    </span>
  );
}

export function DashboardKeywordTagWithAdd({
  children,
  sublabel,
  addHref,
  addLabel,
  className,
}: {
  children: string;
  sublabel?: string;
  addHref: string;
  addLabel: string;
  className?: string;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  const measureTruncation = useCallback(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setIsTruncated(el.scrollWidth > el.clientWidth + 1);
  }, [expanded]);

  useLayoutEffect(() => {
    measureTruncation();
    const el = textRef.current;
    if (!el) return;

    const observer = new ResizeObserver(measureTruncation);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, expanded, measureTruncation]);

  const canExpand = isTruncated || expanded;

  return (
    <div
      className={cn(
        "flex w-full items-center border border-border/70 bg-background/80 pr-1",
        expanded ? "items-start rounded-2xl" : "rounded-full",
        className
      )}
    >
      <button
        type="button"
        className={cn(
          "min-w-0 flex-1 px-4 py-2 text-left",
          canExpand ? "cursor-pointer" : "cursor-default"
        )}
        onClick={() => {
          if (canExpand) setExpanded((value) => !value);
        }}
        aria-expanded={expanded}
        aria-label={
          canExpand
            ? expanded
              ? "一覧を折りたたむ"
              : "全文を表示"
            : undefined
        }
        disabled={!canExpand}
      >
        <p
          ref={textRef}
          className={cn(
            "text-[11px] font-medium text-foreground",
            expanded ? "whitespace-normal break-words leading-relaxed" : "truncate"
          )}
        >
          {children}
        </p>
        {sublabel ? (
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/90">
            {sublabel}
          </p>
        ) : null}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        asChild
      >
        <Link href={addHref} aria-label={addLabel} title={addLabel}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
