import { notFound } from "next/navigation";
import { CompetitionPublicResultsTimetable } from "@/components/public/CompetitionPublicResultsTimetable";
import { buildCompetitionPublicResultsTimetable } from "@/lib/competitionPublicResultsTimetable";

type Props = {
  competitionId: string;
};

export async function CompetitionPublicResultsTimetableLoader({ competitionId }: Props) {
  const data = await buildCompetitionPublicResultsTimetable(competitionId);
  if (!data) {
    notFound();
  }

  return (
    <CompetitionPublicResultsTimetable
      competitionId={data.competitionId}
      competitionName={data.competitionName}
      sections={data.sections}
      scheduleTabCount={data.scheduleTabCount}
      scheduleTabs={data.scheduleTabs}
      roundCounts={data.roundCounts}
    />
  );
}
