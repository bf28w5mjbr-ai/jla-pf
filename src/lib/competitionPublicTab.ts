export type CompetitionPublicTabValue = "overview" | "results";

export function parseCompetitionPublicTab(
  raw: string | null | undefined
): CompetitionPublicTabValue {
  if (raw === "results" || raw === "start-list") return "results";
  return "overview";
}
