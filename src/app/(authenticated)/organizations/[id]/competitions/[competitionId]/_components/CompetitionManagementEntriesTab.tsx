import type { ComponentProps } from "react";
import CompetitionEntriesTabContent from "@/components/admin/CompetitionEntriesTabContent";

export default function CompetitionManagementEntriesTab({
  organizationId,
  competitionId,
}: {
  organizationId: string;
  competitionId: string;
}) {
  const canEdit = true;
  return (
    <CompetitionEntriesTabContent
      organizationId={organizationId}
      competitionId={competitionId}
      canEdit={canEdit}
    />
  );
}

export type CompetitionEntriesTabProps = ComponentProps<typeof CompetitionManagementEntriesTab>;
