import { notFound } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth";
import { loadCompetitionOfficialResultsPayload } from "@/lib/competitionOfficialResultsPayload";
import { CompetitionResultsDisplay } from "./_components/CompetitionResultsDisplay";

export const dynamic = "force-dynamic";

export default async function CompetitionResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: competitionId } = await params;
  const viewerId = await getOptionalAuthenticatedUserId();
  const payload = await loadCompetitionOfficialResultsPayload(competitionId, viewerId);
  if (!payload) {
    notFound();
  }
  return <CompetitionResultsDisplay {...payload} />;
}
