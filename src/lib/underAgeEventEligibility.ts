import {
  ageFitsUnderPartition,
  partitionUnderAgeBands,
  resolveUnderTierKeyForSeasonalAge,
} from "@/lib/competitionUnderAgeSystem";
import { meetsEventAgeOrBirthRule, type EventBirthDateFields } from "@/lib/eventBirthDateEligibility";
import { normalizeAllowListToPartition } from "@/lib/underBandAllowList";

type UnderPartition = ReturnType<typeof partitionUnderAgeBands>;

/**
 * 種目の年齢可否。大会でアンダー制が有効かつ種目でアンダー判定がオンのときは帯のみを見る（生年月日範囲は無視）。
 * effectiveUnderBandAllowList が null のときはマスタの全帯を許可。空配列は誰も不可。
 */
export function meetsCompetitionEventAgeEligibility(params: {
  competitionUnderAgeEnabled: boolean;
  underPartition: UnderPartition | null;
  eventUnderAgeEligibilityEnabled: boolean;
  /** null=全帯許可（従来互換）。非 null はそのサブセットのみ許可 */
  effectiveUnderBandAllowList: string[] | null;
  event: EventBirthDateFields;
  userDateOfBirth: Date | null;
  seasonalAgeYears: number | null;
}): boolean {
  const {
    competitionUnderAgeEnabled,
    underPartition,
    eventUnderAgeEligibilityEnabled,
    effectiveUnderBandAllowList,
    event,
    userDateOfBirth,
    seasonalAgeYears,
  } = params;

  if (
    competitionUnderAgeEnabled &&
    eventUnderAgeEligibilityEnabled &&
    underPartition
  ) {
    if (seasonalAgeYears === null) return false;
    if (!ageFitsUnderPartition(seasonalAgeYears, underPartition)) return false;
    const tierKey = resolveUnderTierKeyForSeasonalAge(seasonalAgeYears, underPartition);
    if (tierKey === null) return false;
    const restricted = normalizeAllowListToPartition(effectiveUnderBandAllowList, underPartition);
    if (restricted !== null) {
      if (restricted.length === 0) return false;
      if (!restricted.includes(tierKey)) return false;
    }
    return true;
  }

  return meetsEventAgeOrBirthRule({
    userDateOfBirth,
    userEligibilityAgeYears: seasonalAgeYears,
    event,
  });
}
