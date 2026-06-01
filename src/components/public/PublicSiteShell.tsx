"use client";

import { useState, type ReactNode } from "react";
import { PublicSiteHeader } from "@/components/public/PublicSiteHeader";
import { PublicSiteSidebar } from "@/components/public/PublicSiteSidebar";

type Props = {
  children: ReactNode;
  isLoggedIn: boolean;
};

export function PublicSiteShell({ children, isLoggedIn }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <PublicSiteSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <PublicSiteHeader
          isLoggedIn={isLoggedIn}
          onOpenMenu={() => setSidebarOpen(true)}
          isMenuOpen={sidebarOpen}
        />
        <main className="app-main-canvas min-h-0 min-w-0 flex-1 pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)] pr-[var(--safe-area-right)]">
          {children}
        </main>
      </div>
    </div>
  );
}
