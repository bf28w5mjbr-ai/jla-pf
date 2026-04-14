import {
  type CompetitionAgeCategoryForEntryFee,
  resolveEntryFeeUnits,
} from "@/lib/competitionEntryAgeTiered";
import { partitionUnderAgeBands } from "@/lib/competitionUnderAgeSystem";

export type CompetitionEntryFeeConfig = {
  individualEntryFee?: number;
  teamEntryFeePerTeam?: number;
  baseFee?: number;
  /** クラブによる個人エントリー先払いの請求タイミング（未設定時は resolveClubIndividualEntryBillingTiming で自動判定） */
  clubIndividualBilling?: "instant" | "post_close";
  /** 真のときは個人種目数に比例して料金が変わる想定とし締切後請求側に分類（計算式は entryFee 側で拡張） */
  individualEntryFeePerEvent?: boolean;
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
  underFeeTiers?: Array<{
    tierKey: string;
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
    underFeePartition?: ReturnType<typeof partitionUnderAgeBands> | null;
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
      underFeePartition: options?.underFeePartition ?? null,
    }
  );
  if (ageTierMissing) return 0;

  return (individualCount > 0 ? individualUnit : 0) + teamUnit * teamCount;
}
