export const CLUB_DETAIL_TAB_VALUES = ["members", "competitions"] as const;

export type ClubDetailTabValue = (typeof CLUB_DETAIL_TAB_VALUES)[number];

export function parseClubDetailTab(tab: string | null | undefined): ClubDetailTabValue {
  if (tab && (CLUB_DETAIL_TAB_VALUES as readonly string[]).includes(tab)) {
    return tab as ClubDetailTabValue;
  }
  return "members";
}
