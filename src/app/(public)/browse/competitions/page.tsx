import { Metadata } from "next";
import { CompetitionsBrowseListPage } from "@/components/competitions/CompetitionsBrowseListPage";
import { appRoutes } from "@/lib/appRoutes";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "大会一覧 | Bluvium",
  description: "ライフセービング大会一覧",
};

export default function PublicCompetitionsBrowsePage({
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
      listBasePath={appRoutes.public.competitions()}
      competitionDetailHref={appRoutes.public.competitionView}
      searchParams={searchParams}
    />
  );
}
