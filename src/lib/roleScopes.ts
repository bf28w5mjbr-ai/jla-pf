export type ClubMembershipRole = "ADMIN" | "MEMBER" | string;
export type OrganizationAdminRole = "ADMIN" | string;

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

/** 主催団体が本番運用可能（大会作成・編集・公開・エントリー管理など） */
export function isOrgOperationalStatus(status: string | null | undefined): boolean {
  return status === "APPROVED";
}

/** 仮登録中も許可（基本情報・招待・支払い）。停止中は不可 */
export function isOrgOnboardingAllowedStatus(status: string | null | undefined): boolean {
  if (!status || status === "SUSPENDED" || status === "INACTIVE") return false;
  return status === "PENDING" || status === "APPROVED";
}

/**
 * 大会の本番運用系操作向け: OrgAdmin(ADMIN) かつ主催団体が APPROVED。
 */
export function hostOrgAdminCanManageCompetition(
  orgAdminsForCurrentUser: ReadonlyArray<{ role?: OrganizationAdminRole | null }>,
  orgStatus: string | null | undefined
): boolean {
  return hasOrgAdminAccess(orgAdminsForCurrentUser) && isOrgOperationalStatus(orgStatus);
}

/**
 * 主催団体プロフィール・ロゴ・オンボーディング向け: OrgAdmin(ADMIN) かつ PENDING/APPROVED。
 */
export function hostOrgAdminCanManageOnboarding(
  orgAdminsForCurrentUser: ReadonlyArray<{ role?: OrganizationAdminRole | null }>,
  orgStatus: string | null | undefined
): boolean {
  return hasOrgAdminAccess(orgAdminsForCurrentUser) && isOrgOnboardingAllowedStatus(orgStatus);
}

export function normalizeRoleForDisplay(role?: string | null): string {
  if (!role) return "MEMBER";
  return isClubAdminRole(role) ? "ADMIN" : role;
}

export function normalizeClubRoleForWrite(role?: string | null): "ADMIN" | "MEMBER" {
  if (isClubAdminRole(role)) return "ADMIN";
  return "MEMBER";
}

export function normalizeOrgRoleForWrite(role?: string | null): "ADMIN" {
  void role;
  return "ADMIN";
}
