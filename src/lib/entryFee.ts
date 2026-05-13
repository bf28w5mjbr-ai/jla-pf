import {
  type CompetitionAgeCategoryForEntryFee,
  resolveEntryFeeUnits,
} from "@/lib/competitionEntryAgeTiered";

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
};

/**
 * 個人エントリー POST の `calculateCompetitionEntryFee` に渡す件数。
 * チーム種目のみの参加意思（items 空・teamEntries キーなし）でクラブのみ選んだとき、`teamCount` を 1 にするのは
 * {@link calculateCompetitionEntryFee} で個人単価のみを取るための課金用トリガーであり、チームロスターが 1 件増えたことを意味しない。
 */
export function billingCountsForPersonalEntryPost(options: {
  teamOnlyIntentWithoutItemSelection: boolean;
  entryItemsCount: number;
  teamEntriesCount: number;
}): { individualCount: number; teamCount: number } {
  let individualCount = Math.max(0, options.entryItemsCount);
  let teamCount = Math.max(0, options.teamEntriesCount);
  if (
    options.teamOnlyIntentWithoutItemSelection &&
    individualCount === 0 &&
    teamCount === 0
  ) {
    teamCount = 1;
  }
  return { individualCount, teamCount };
}

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

  // 個人エントリーでチーム種目のみ: 個人1枠分と同額（チーム組数は上乗せしない）
  if (teamCount > 0 && individualCount === 0) {
    return individualUnit;
  }

  return (individualCount > 0 ? individualUnit : 0) + teamUnit * teamCount;
}
