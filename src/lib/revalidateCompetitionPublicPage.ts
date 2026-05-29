import { revalidateTag } from "next/cache";
import { competitionPublicPageTag } from "@/lib/cacheTags";

/** 公開大会ページの匿名向け unstable_cache を即時無効化 */
export function revalidateCompetitionPublicPage(competitionId: string): void {
  revalidateTag(competitionPublicPageTag(competitionId), "max");
}
