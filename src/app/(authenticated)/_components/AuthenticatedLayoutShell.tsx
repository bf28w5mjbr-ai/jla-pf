import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  getAuthenticatedLayoutUser,
  getCachedUnreadNotificationCount,
} from "@/lib/authenticatedLayoutData";
import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";
import { isClubAdminRole } from "@/lib/roleScopes";

export async function AuthenticatedLayoutShell({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [user, unreadNotificationCount] = await Promise.all([
    getAuthenticatedLayoutUser(userId),
    getCachedUnreadNotificationCount(userId).catch(() => 0),
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
