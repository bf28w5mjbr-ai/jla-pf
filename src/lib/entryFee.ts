export type CompetitionEntryFeeConfig = {
  individualEntryFee?: number;
  teamEntryFeePerTeam?: number;
  baseFee?: number;
};

export function calculateCompetitionEntryFee(
  entryFee: CompetitionEntryFeeConfig | number | null | undefined,
  counts: {
    individualCount: number;
    teamCount: number;
  }
): number {
  const individualCount = Math.max(0, counts.individualCount);
  const teamCount = Math.max(0, counts.teamCount);
  const selectedCount = individualCount + teamCount;

  if (selectedCount === 0 || entryFee === null || entryFee === undefined) return 0;
  if (typeof entryFee === "number") return entryFee;

  const individualFee =
    typeof entryFee.individualEntryFee === "number"
      ? entryFee.individualEntryFee
      : typeof entryFee.baseFee === "number"
        ? entryFee.baseFee
        : 0;
  const teamFee = typeof entryFee.teamEntryFeePerTeam === "number" ? entryFee.teamEntryFeePerTeam : 0;

  return (individualCount > 0 ? individualFee : 0) + teamFee * teamCount;
}
