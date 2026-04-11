export const ORGANIZATION_DETAIL_TAB_VALUES = [
  "competitions",
  "members",
  "business",
] as const;

export type OrganizationDetailTabValue =
  (typeof ORGANIZATION_DETAIL_TAB_VALUES)[number];

export function parseOrganizationDetailTab(
  tab: string | null | undefined
): OrganizationDetailTabValue {
  if (
    tab &&
    (ORGANIZATION_DETAIL_TAB_VALUES as readonly string[]).includes(tab)
  ) {
    return tab as OrganizationDetailTabValue;
  }
  return "competitions";
}
