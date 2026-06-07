import { HomeClubsShowcase } from "@/components/home/HomeClubsShowcase";
import { loadHomeFeaturedClubs } from "@/lib/homeFeaturedContent";

export async function HomeClubsShowcaseLoader() {
  const featuredClubs = await loadHomeFeaturedClubs();
  return <HomeClubsShowcase clubs={featuredClubs} />;
}
