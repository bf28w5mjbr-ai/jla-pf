"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AppMobileTopBar } from "@/components/AppMobileTopBar";
import { UnreadNotificationCountProvider } from "@/components/UnreadNotificationCountContext";
import { cn } from "@/lib/utils";

interface Organization {
  id: string;
  name: string;
  abbreviation?: string | null;
}

interface AuthenticatedAppShellProps {
  children: ReactNode;
  userRole?: string;
  isClubAdmin: boolean;
  isAssociationAdmin: boolean;
  organizations: Organization[];
  managedClubs: Organization[];
  unreadNotificationCount: number;
}

export function AuthenticatedAppShell({
  children,
  userRole,
  isClubAdmin,
  isAssociationAdmin,
  organizations,
  managedClubs,
  unreadNotificationCount,
}: AuthenticatedAppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();
  const isDashboardFullBleed =
    pathname === "/dashboard" || pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <UnreadNotificationCountProvider initialUnreadCount={unreadNotificationCount}>
      <div className="flex min-h-screen bg-background">
        <Sidebar
          userRole={userRole}
          isClubAdmin={isClubAdmin}
          isAssociationAdmin={isAssociationAdmin}
          organizations={organizations}
          managedClubs={managedClubs}
          open={isSidebarOpen}
          onOpenChange={setIsSidebarOpen}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppMobileTopBar onOpenMenu={() => setIsSidebarOpen(true)} isMenuOpen={isSidebarOpen} />
          <main
            className={cn(
              "app-main-canvas min-h-screen min-w-0 flex-1 pb-[var(--safe-area-bottom)]",
              isDashboardFullBleed
                ? "px-0 pt-0"
                : "px-[var(--app-content-gutter)] pt-2 lg:pt-[var(--safe-area-top)]"
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </UnreadNotificationCountProvider>
  );
}
