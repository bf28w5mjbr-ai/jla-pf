/** 個人エントリー POST の items が INDIVIDUAL / TEAM 混在か（重複削除後の種類数）。 */
export function personalEntryItemsHasMixedEventTypes(types: readonly string[]): boolean {
  const set = new Set(types.filter((t) => t === "INDIVIDUAL" || t === "TEAM"));
  return set.size > 1;
}

/** 既存エントリーに混在種目が残っている（移行前データ）ときのみ、同一 POST での混在を許す。 */
export function existingEntryItemsWereLegacyMixed(
  types: ReadonlyArray<string | undefined | null>
): boolean {
  const set = new Set(types.filter((t) => t === "INDIVIDUAL" || t === "TEAM"));
  return set.size > 1;
}

/**
 * 一般利用者の items が INDIVIDUAL / TEAM 混在になる POST を許可しない（移行前の混在のみ例外）。
 */
export function shouldBlockPersonalEntryItemsXorForGeneralUser(params: {
  isAdmin: boolean;
  incomingItemTypes: readonly ("INDIVIDUAL" | "TEAM")[];
  persistedSubmittedItemTypes: readonly ("INDIVIDUAL" | "TEAM")[] | null | undefined;
}): boolean {
  if (params.isAdmin) return false;
  if (!personalEntryItemsHasMixedEventTypes(params.incomingItemTypes)) return false;
  const prev = params.persistedSubmittedItemTypes ?? [];
  return !existingEntryItemsWereLegacyMixed(prev);
}

/**
 * 「チーム種目のみ」を items に含むときも、クラブ所属必須大会ではclubId と同様に扱われる検証と揃える用。
 */
export function teamOnlyItemSelectionRequiresClubId(
  requireClubMembership: boolean,
  itemTypes: readonly ("INDIVIDUAL" | "TEAM")[],
  clubId: string | null | undefined
): boolean {
  if (!requireClubMembership) return false;
  if (itemTypes.length === 0) return false;
  if (!itemTypes.every((t) => t === "TEAM")) return false;
  return !clubId || typeof clubId !== "string";
}
