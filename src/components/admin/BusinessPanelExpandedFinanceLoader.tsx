import CompetitionFinanceTabContent from "@/components/admin/CompetitionFinanceTabContent";

type Props = {
  organizationId: string;
  competitionId: string;
  isOrgAdmin: boolean;
};

export default async function BusinessPanelExpandedFinanceLoader({
  organizationId,
  competitionId,
  isOrgAdmin,
}: Props) {
  if (!isOrgAdmin) return null;

  return (
    <CompetitionFinanceTabContent
      organizationId={organizationId}
      competitionId={competitionId}
      canEdit={isOrgAdmin}
      embedded
    />
  );
}
