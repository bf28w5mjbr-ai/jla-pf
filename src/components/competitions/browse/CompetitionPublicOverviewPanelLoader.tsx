import { notFound } from "next/navigation";
import {
  loadCompetitionPublicAdminOverviewOverlay,
  loadCompetitionPublicOverviewDetail,
  withAdminPublicOverviewOverlay,
} from "@/lib/competitionPublicPageLoader";
import { canEditCompetitionPublicContent } from "@/lib/competitionStartListAccess";
import { CompetitionPublicOverviewPanel } from "./CompetitionPublicOverviewPanel";

type Props = {
  competitionId: string;
  sessionUserId: string | null;
  layout?: "classic" | "editorial";
};

export async function CompetitionPublicOverviewPanelLoader({
  competitionId,
  sessionUserId,
  layout = "classic",
}: Props) {
  let competition = await loadCompetitionPublicOverviewDetail(competitionId, sessionUserId);

  if (!competition) {
    notFound();
  }

  const canEdit = canEditCompetitionPublicContent({
    orgAdminsForCurrentUser: competition.organization.admins,
    orgStatus: competition.organization.status,
  });

  if (canEdit) {
    const adminOverlay = await loadCompetitionPublicAdminOverviewOverlay(competitionId);
    competition = withAdminPublicOverviewOverlay(competition, adminOverlay);
  }

  const hasIndividualEvents = competition.events.some((e) => e.type === "INDIVIDUAL");
  const hasTeamEvents = competition.events.some((e) => e.type === "TEAM");
  const showEntryLinks = competition.events.length > 0 && competition.status !== "CANCELLED";

  return (
    <CompetitionPublicOverviewPanel
      competition={competition}
      hasIndividualEvents={hasIndividualEvents}
      hasTeamEvents={hasTeamEvents}
      showEntryLinks={showEntryLinks}
      canEdit={canEdit}
      layout={layout}
    />
  );
}
