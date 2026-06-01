export type CompetitionPublicTabValue = "overview" | "results";

export function parseCompetitionPublicTab(
  raw: string | null | undefined
): CompetitionPublicTabValue {
  if (raw === "results") return "results";
  // 旧ブックマーク（start-list 等）は大会ページへ
  return "overview";
}
