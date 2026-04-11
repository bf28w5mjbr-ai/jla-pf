import type { RoleLike } from "@/lib/platformTaxonomy";

export const FIXED_ROLE_SEGMENTS = ["個人", "クラブ", "大会開催者", "協会"] as const;
export const FIXED_FEATURE_SEGMENTS = ["大会", "資格講習", "キャリア"] as const;

export const LIFESAVER_STATUSES = {
  CERTIFIED: "CERTIFIED",
  NOT_CERTIFIED: "NOT_CERTIFIED",
  SUSPENDED: "SUSPENDED",
  EXPIRED: "EXPIRED",
} as const;

export type LifesaverStatus =
  (typeof LIFESAVER_STATUSES)[keyof typeof LIFESAVER_STATUSES];

export function isPfAdminRole(role?: RoleLike): boolean {
  return role === "PF_ADMIN";
}

export function canManageUserAccount(role?: RoleLike): boolean {
  // 協会はユーザー作成/削除/停止を行えない。PF運営のみ可能。
  return isPfAdminRole(role);
}

export function canEditUserProfileAsAdmin(role?: RoleLike): boolean {
  // 協会はユーザープロフィール変更権限を持たない。PF運営のみ可能。
  return isPfAdminRole(role);
}
