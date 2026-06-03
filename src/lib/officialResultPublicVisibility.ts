import type { Prisma } from "@prisma/client";

/**
 * 非管理者向けの公式結果読み取りフィルタ。
 * ヒート確定（heatConfirmations）またはラウンド確定（lockedAt）があるもののみ公開する。
 * publishedAt は廃止（公開スタートリストのヒート確定が観客向けの正）。
 */
export function officialResultPublicVisibilityWhere(): Prisma.OfficialResultWhereInput {
  return {
    OR: [{ lockedAt: { not: null } }, { heatConfirmations: { some: {} } }],
  };
}

export function mergeOfficialResultVisibilityFilter(
  base: Prisma.OfficialResultWhereInput,
  canViewAll: boolean
): Prisma.OfficialResultWhereInput {
  if (canViewAll) {
    return base;
  }
  return {
    AND: [base, officialResultPublicVisibilityWhere()],
  };
}
