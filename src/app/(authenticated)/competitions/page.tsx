import { Metadata } from "next";
import { CompetitionsBrowseListPage } from "@/components/competitions/CompetitionsBrowseListPage";
import { appRoutes } from "@/lib/appRoutes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "大会一覧 | Bluvium",
  description: "ライフセービング大会一覧",
};

export default function MemberCompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    view?: string;
    q?: string;
    sort?: string;
  }>;
}) {
  return (
    <CompetitionsBrowseListPage
      listBasePath={appRoutes.competitions.list()}
      competitionDetailHref={appRoutes.competitions.root}
      searchParams={searchParams}
    />
  );
}
