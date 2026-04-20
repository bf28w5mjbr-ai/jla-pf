import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import {
  getAuthenticatedLayoutUser,
  getCachedUnreadNotificationCount,
} from "@/lib/authenticatedLayoutData";
import { GlobalNotificationBell } from "@/components/GlobalNotificationBell";
import Sidebar from "@/components/Sidebar";
import React from "react";
import { isClubAdminRole } from "@/lib/roleScopes";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (!session?.userId) {
    redirect("/login");
  }

  const user = await getAuthenticatedLayoutUser(session.userId);

  if (!user) {
    redirect("/login");
  }

  const isClubAdmin = user.memberships.some((m) => isClubAdminRole(m.role));
  const isAssociationAdmin = user.associationAdminRoles.length > 0;

  const userOrganizations = [...user.orgAdminRoles]
    .map((r) => r.organization)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const unreadNotificationCount = await getCachedUnreadNotificationCount(session.userId);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        userRole={user.role}
        isClubAdmin={isClubAdmin}
        isAssociationAdmin={isAssociationAdmin}
        organizations={userOrganizations}
        managedClubs={user.memberships.map((membership) => membership.club)}
      />
      <GlobalNotificationBell unreadCount={unreadNotificationCount} />
      <main className="app-main-canvas min-h-screen min-w-0 flex-1 pb-[var(--safe-area-bottom)] px-[var(--app-fab-gutter)] pt-[calc(var(--safe-area-top)+4rem)] lg:pt-[var(--safe-area-top)]">
        {children}
      </main>
    </div>
  );
}
