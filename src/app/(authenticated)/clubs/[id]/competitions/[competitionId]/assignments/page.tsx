import { redirect } from "next/navigation";
import { appRoutes } from "@/lib/appRoutes";

export const dynamic = "force-dynamic";

/**
 * クラブ詳細配下の割り当て専用URL。
 * 実装本体は `/team?tab=assignment` を利用し、導線だけを明確化する。
 */
export default async function ClubCompetitionAssignmentsPage({
  params,
}: {
  params: Promise<{ id: string; competitionId: string }>;
}) {
  const { id, competitionId } = await params;
  redirect(appRoutes.clubs.competition.team(id, competitionId, { tab: "assignment" }));
}

