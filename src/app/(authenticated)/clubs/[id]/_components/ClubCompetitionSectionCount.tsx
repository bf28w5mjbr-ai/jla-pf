import { loadClubCompetitionSectionCount } from "@/lib/clubCompetitionTabLoader";

export async function ClubCompetitionSectionCount({
  clubId,
  clubName,
}: {
  clubId: string;
  clubName: string;
}) {
  const count = await loadClubCompetitionSectionCount(clubId, clubName);
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
}: {
  clubId: string;
  clubName: string;
}) {
  const count = await loadClubCompetitionSectionCount(clubId, clubName);
  return <>{count}</>;
}
