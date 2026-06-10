"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { dashboardContentClassName } from "./dashboardLayout";

export function DashboardProfileHeroLayout({
  actions,
  identity,
  credits,
  contentClassName,
}: {
  actions: ReactNode;
  identity: ReactNode;
  credits: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div
      className={cn(
        "relative z-10 flex min-h-[inherit] flex-1 flex-col pb-6 pt-14 sm:pb-8 sm:pt-16",
        contentClassName,
        dashboardContentClassName
      )}
    >
      <div className="absolute right-[var(--app-content-gutter)] top-4 z-20 flex shrink-0 items-center gap-1 sm:right-5 lg:right-8">
        {actions}
      </div>

      <div className="space-y-3">
        {identity}
        {credits}
      </div>
    </div>
  );
}
