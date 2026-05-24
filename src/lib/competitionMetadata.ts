import type { Metadata } from "next";
import { getCompetitionPublicName } from "@/lib/competitionPublicPageLoader";

/** 大会系ページの generateMetadata タイトル用（軽量・cache 付き） */
export { getCompetitionPublicName as getCompetitionName };

export async function competitionMetadataTitle(
  competitionId: string,
  titleSuffix: string
): Promise<Metadata> {
  const competition = await getCompetitionPublicName(competitionId);
  return {
    title: `${titleSuffix} | ${competition?.name || "大会"} | Bluvium`,
  };
}

export async function competitionMetadataTitleOnly(
  competitionId: string
): Promise<Metadata> {
  const competition = await getCompetitionPublicName(competitionId);
  return {
    title: `${competition?.name || "大会"} | Bluvium`,
  };
}
