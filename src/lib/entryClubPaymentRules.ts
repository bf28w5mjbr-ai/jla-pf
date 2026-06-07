/**
 * 個人エントリー保存時の所属クラブ要否。
 * requireClubMembership が false のとき、参加費の有無に関わらず clubId は不要。
 */
export function entryRequiresClubSelection(params: {
  requireClubMembership: boolean;
  clubId: string | null | undefined;
}): boolean {
  if (!params.requireClubMembership) {
    return false;
  }
  return !params.clubId || typeof params.clubId !== "string";
}

/**
 * 有料エントリー時に clubId を必須とするか。
 * 旧実装は totalFee > 0 だけで clubId を要求していたが、
 * 所属クラブ不要大会では参加費があっても clubId なしで決済可能。
 */
export function paidEntryRequiresClubId(params: {
  requireClubMembership: boolean;
  totalFee: number;
  clubId: string | null | undefined;
}): boolean {
  void params.totalFee;
  return entryRequiresClubSelection(params);
}
