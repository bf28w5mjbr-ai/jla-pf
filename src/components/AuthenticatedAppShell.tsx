"use client";

import { useState, type ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import { AppMobileTopBar } from "@/components/AppMobileTopBar";
import { UnreadNotificationCountProvider } from "@/components/UnreadNotificationCountContext";

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
            className="app-main-canvas min-h-screen min-w-0 flex-1 px-[var(--app-content-gutter)] pb-[var(--safe-area-bottom)] pt-2 lg:pt-[var(--safe-area-top)]"
          >
            {children}
          </main>
        </div>
      </div>
    </UnreadNotificationCountProvider>
  );
}
