import { Metadata } from "next";
import { parseCompetitionPublicTab } from "@/lib/competitionPublicTab";
import { competitionMetadataTitleOnly } from "@/lib/competitionMetadata";
import { CompetitionBrowseDetailPage } from "@/components/competitions/browse/CompetitionBrowseDetailPage";
import { appRoutes } from "@/lib/appRoutes";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return competitionMetadataTitleOnly(id);
}

export default async function MemberCompetitionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = parseCompetitionPublicTab(tab);

  return (
    <CompetitionBrowseDetailPage
      layout="editorial"
      competitionId={id}
      activeTab={activeTab}
      detailBasePath={appRoutes.competitions.root(id)}
    />
  );
}
