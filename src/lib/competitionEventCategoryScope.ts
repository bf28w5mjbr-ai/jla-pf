export type CompetitionEventCategoryScope = "POOL_ONLY" | "OCEAN_ONLY";

export function resolveCompetitionEventCategoryScope(
  category: string | null | undefined
): CompetitionEventCategoryScope {
  const raw = (category ?? "").trim();
  if (!raw) return "POOL_ONLY";

  const normalized = raw.toLowerCase();

  const hasPool = normalized.includes("pool") || raw.includes("プール");
  const hasOcean =
    normalized.includes("ocean") ||
    raw.includes("オーシャン") ||
    raw.includes("オープンウォーター") ||
    normalized.includes("open water") ||
    normalized.includes("openwater");

  if (hasOcean && !hasPool) return "OCEAN_ONLY";
  return "POOL_ONLY";
}

export function competitionEventCategoryScopeLabel(
  scope: CompetitionEventCategoryScope
): string {
  if (scope === "POOL_ONLY") return "プール競技のみ";
  return "オーシャン競技のみ";
}
