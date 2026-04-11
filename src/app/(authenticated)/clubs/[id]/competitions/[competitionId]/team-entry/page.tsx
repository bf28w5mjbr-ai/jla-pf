import { redirect } from "next/navigation";
import { appRoutes } from "@/lib/appRoutes";
import { mergeTeamHubQuery } from "@/lib/teamHubRedirect";

export const dynamic = "force-dynamic";

/** @deprecated `/team?tab=entry` へ統合 */

export default async function ClubTeamEntryRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; competitionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, competitionId } = await params;
  const sp = await searchParams;
  const qs = mergeTeamHubQuery("entry", sp);
  redirect(`${appRoutes.clubs.competition.team(id, competitionId)}?${qs}`);
}
