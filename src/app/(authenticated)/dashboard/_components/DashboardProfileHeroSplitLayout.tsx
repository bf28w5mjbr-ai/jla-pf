"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DashboardProfileHeroSplitLayout({
  actions,
  identity,
  credits,
}: {
  actions: ReactNode;
  identity: ReactNode;
  credits: ReactNode;
}) {
  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col border-r border-border/40 bg-background">
      <div className="flex items-center justify-end px-4 pt-4">{actions}</div>

      <div className="flex flex-1 flex-col justify-center px-5 pb-8 pt-2 sm:px-6">
        <div className="space-y-5">
          {identity}
          <div className="space-y-2 border-t border-border/50 pt-4">{credits}</div>
        </div>
      </div>
    </div>
  );
}
