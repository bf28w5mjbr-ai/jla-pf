export type CompetitionEventCategoryScope = "POOL_ONLY" | "OCEAN_ONLY";

export function resolveCompetitionEventCategoryScope(
  category: string | null | undefined
): CompetitionEventCategoryScope {
  const normalized = (category ?? "").trim().toLowerCase();
  if (!normalized) return "POOL_ONLY";

  const hasPool = normalized.includes("pool") || normalized.includes("プール");
  const hasOcean = normalized.includes("ocean") || normalized.includes("オーシャン");

  if (hasOcean && !hasPool) return "OCEAN_ONLY";
  return "POOL_ONLY";
}

export function competitionEventCategoryScopeLabel(
  scope: CompetitionEventCategoryScope
): string {
  if (scope === "POOL_ONLY") return "プール競技のみ";
  return "オーシャン競技のみ";
}
