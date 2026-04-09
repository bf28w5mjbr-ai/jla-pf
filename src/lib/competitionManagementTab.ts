export const COMPETITION_MANAGEMENT_TAB_VALUES = [
  "page",
  "official",
  "entries",
  "finance",
] as const;

export type CompetitionManagementTabValue =
  (typeof COMPETITION_MANAGEMENT_TAB_VALUES)[number];

export function parseCompetitionManagementTab(
  tab: string | null | undefined
): CompetitionManagementTabValue {
  if (
    tab &&
    (COMPETITION_MANAGEMENT_TAB_VALUES as readonly string[]).includes(tab)
  ) {
    return tab as CompetitionManagementTabValue;
  }
  return "page";
}
