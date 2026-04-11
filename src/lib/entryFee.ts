import {
  type CompetitionAgeCategoryForEntryFee,
  resolveEntryFeeUnits,
} from "@/lib/competitionEntryAgeTiered";

export type CompetitionEntryFeeConfig = {
  individualEntryFee?: number;
  teamEntryFeePerTeam?: number;
  baseFee?: number;
  /** 年齢帯別（大会開催日基準の満年齢）。非空配列のとき年齢帯別として解釈 */
  ageFeeTiers?: Array<{
    minAge: number;
    maxAge: number | null;
    individualEntryFee: number;
    teamEntryFeePerTeam: number;
  }>;
  /** 年齢カテゴリ（生年月日範囲）別 */
  ageCategoryFeeTiers?: Array<{
    ageCategoryId: string;
    individualEntryFee: number;
    teamEntryFeePerTeam: number;
  }>;
};

export function calculateCompetitionEntryFee(
  entryFee: CompetitionEntryFeeConfig | number | null | undefined,
  counts: {
    individualCount: number;
    teamCount: number;
  },
  options?: {
    userAgeYearsAtCompetitionStart?: number | null;
    userDateOfBirth?: Date | null;
    competitionAgeCategories?: ReadonlyArray<CompetitionAgeCategoryForEntryFee> | null;
  }
): number {
  const individualCount = Math.max(0, counts.individualCount);
  const teamCount = Math.max(0, counts.teamCount);
  const selectedCount = individualCount + teamCount;

  if (selectedCount === 0 || entryFee === null || entryFee === undefined) return 0;
  if (typeof entryFee === "number") return entryFee;

  const { individualUnit, teamUnit, ageTierMissing } = resolveEntryFeeUnits(
    entryFee,
    options?.userAgeYearsAtCompetitionStart ?? null,
    {
      userDateOfBirth: options?.userDateOfBirth ?? null,
      competitionAgeCategories: options?.competitionAgeCategories ?? null,
    }
  );
  if (ageTierMissing) return 0;

  return (individualCount > 0 ? individualUnit : 0) + teamUnit * teamCount;
}
