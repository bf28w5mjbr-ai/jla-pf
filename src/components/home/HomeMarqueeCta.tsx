"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  href: string;
  label: string;
  className?: string;
};

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

const MARQUEE_REPEAT = 6;

export function HomeMarqueeCta({ href, label, className }: Props) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getReducedMotionServerSnapshot
  );

  const segment = (
    <span className="inline-flex shrink-0 items-center gap-2 px-6 text-sm font-medium tracking-wide text-muted-foreground">
      {label}
      <ArrowRight className="size-4 opacity-70" aria-hidden />
    </span>
  );

  if (reducedMotion) {
    return (
      <div className={cn("flex justify-center py-6", className)}>
        <Button asChild variant="outline" size="lg" className="gap-2">
          <Link href={href}>
            {label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden border-y border-border/60 bg-muted/30 py-3",
        className
      )}
    >
      <div className="home-marquee-track flex w-max" aria-hidden>
        {Array.from({ length: MARQUEE_REPEAT * 2 }).map((_, i) => (
          <span key={i}>{segment}</span>
        ))}
      </div>
      <Link
        href={href}
        className="absolute inset-0 flex items-center justify-center bg-background/75 text-sm font-semibold text-foreground backdrop-blur-[2px] transition-colors hover:bg-background/85 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="inline-flex items-center gap-2">
          {label}
          <ArrowRight className="size-4" aria-hidden />
        </span>
      </Link>
    </div>
  );
}
