import {
  loadClubCompetitionSectionCountFast,
  loadClubCompetitionSectionCountFull,
} from "@/lib/clubCompetitionTabLoader";

export async function ClubCompetitionSectionCount({
  clubId,
  clubName: _clubName,
}: {
  clubId: string;
  clubName: string;
}) {
  const count = await loadClubCompetitionSectionCountFast(clubId);
  return (
    <>
      {count.toLocaleString("ja-JP")}
      <span className="ml-1 text-[10px] font-normal text-muted-foreground sm:text-xs">件</span>
    </>
  );
}

export async function ClubCompetitionTabBadgeCount({
  clubId,
  clubName,
  full = false,
}: {
  clubId: string;
  clubName: string;
  /** 大会タブ表示時は TO 応募由来を含む完全カウント */
  full?: boolean;
}) {
  const count = full
    ? await loadClubCompetitionSectionCountFull(clubId, clubName)
    : await loadClubCompetitionSectionCountFast(clubId);
  return <>{count}</>;
}
