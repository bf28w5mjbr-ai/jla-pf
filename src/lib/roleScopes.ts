export type ClubMembershipRole = "ADMIN" | "MEMBER" | string;
export type OrganizationAdminRole = "ADMIN" | "MEMBER" | string;

export function isClubAdminRole(role?: ClubMembershipRole | null): boolean {
  return role === "ADMIN";
}

export function isOrgAdminRole(role?: OrganizationAdminRole | null): boolean {
  return role === "ADMIN";
}

/**
 * `organization.admins` を `where: { userId }` で絞った配列に、主催管理者（ADMIN）が含まれるか。
 * 先頭要素だけ見ると複数行や順序依存で取りこぼすため、常にこちらで判定する。
 */
export function hasOrgAdminAccess(
  orgAdminsForCurrentUser: ReadonlyArray<{ role?: OrganizationAdminRole | null }>
): boolean {
  return orgAdminsForCurrentUser.some((a) => isOrgAdminRole(a.role));
}

export function normalizeRoleForDisplay(role?: string | null): string {
  if (!role) return "MEMBER";
  return isClubAdminRole(role) ? "ADMIN" : role;
}

export function normalizeClubRoleForWrite(role?: string | null): "ADMIN" | "MEMBER" {
  if (isClubAdminRole(role)) return "ADMIN";
  return "MEMBER";
}

export function normalizeOrgRoleForWrite(role?: string | null): "ADMIN" | "MEMBER" {
  if (isOrgAdminRole(role)) return "ADMIN";
  return "MEMBER";
}
