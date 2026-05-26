import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import {
  getAuthenticatedLayoutUser,
  getCachedUnreadNotificationCount,
} from "@/lib/authenticatedLayoutData";
import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";
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

  const [user, unreadNotificationCount] = await Promise.all([
    getAuthenticatedLayoutUser(session.userId),
    getCachedUnreadNotificationCount(session.userId).catch(() => 0),
  ]);

  if (!user) {
    redirect("/login");
  }

  const isClubAdmin = user.memberships.some((m) => isClubAdminRole(m.role));
  const isAssociationAdmin = user.associationAdminRoles.length > 0;

  const userOrganizations = [...user.orgAdminRoles]
    .map((r) => r.organization)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return (
    <AuthenticatedAppShell
      userRole={user.role}
      isClubAdmin={isClubAdmin}
      isAssociationAdmin={isAssociationAdmin}
      organizations={userOrganizations}
      managedClubs={user.memberships.map((membership) => membership.club)}
      unreadNotificationCount={unreadNotificationCount}
    >
      {children}
    </AuthenticatedAppShell>
  );
}
