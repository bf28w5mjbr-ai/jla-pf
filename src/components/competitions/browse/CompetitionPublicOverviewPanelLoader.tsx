import { notFound } from "next/navigation";
import { loadCompetitionPublicOverviewDetail } from "@/lib/competitionPublicPageLoader";
import { CompetitionPublicOverviewPanel } from "./CompetitionPublicOverviewPanel";

type Props = {
  competitionId: string;
  sessionUserId: string | null;
};

export async function CompetitionPublicOverviewPanelLoader({
  competitionId,
  sessionUserId,
}: Props) {
  const competition = await loadCompetitionPublicOverviewDetail(competitionId, sessionUserId);

  if (!competition) {
    notFound();
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
    />
  );
}
