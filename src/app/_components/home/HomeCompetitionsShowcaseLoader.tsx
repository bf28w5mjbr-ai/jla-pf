import { HomeCompetitionsShowcase } from "@/components/home/HomeCompetitionsShowcase";
import {
  loadHomeCompetitionCategories,
  loadHomeFeaturedCompetitions,
} from "@/lib/homeFeaturedContent";

export async function HomeCompetitionsShowcaseLoader() {
  const [upcomingCompetitions, competitionCategories] = await Promise.all([
    loadHomeFeaturedCompetitions(),
    loadHomeCompetitionCategories(),
  ]);

  return (
    <HomeCompetitionsShowcase
      competitions={upcomingCompetitions}
      categories={competitionCategories}
    />
  );
}
