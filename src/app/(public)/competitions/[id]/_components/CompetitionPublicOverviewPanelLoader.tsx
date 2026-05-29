import { notFound } from "next/navigation";
import { loadCompetitionPublicOverviewDetail } from "@/lib/competitionPublicPageLoader";
import { CompetitionPublicOverviewPanel } from "./CompetitionPublicOverviewPanel";

type Props = {
  competitionId: string;
  sessionUserId: string | null;
  hasIndividualEvents: boolean;
  hasTeamEvents: boolean;
  showEntryLinks: boolean;
};

export async function CompetitionPublicOverviewPanelLoader({
  competitionId,
  sessionUserId,
  hasIndividualEvents,
  hasTeamEvents,
  showEntryLinks,
}: Props) {
  const competition = await loadCompetitionPublicOverviewDetail(competitionId, sessionUserId);

  if (!competition) {
    notFound();
  }

  return (
    <CompetitionPublicOverviewPanel
      competition={competition}
      hasIndividualEvents={hasIndividualEvents}
      hasTeamEvents={hasTeamEvents}
      showEntryLinks={showEntryLinks}
    />
  );
}
