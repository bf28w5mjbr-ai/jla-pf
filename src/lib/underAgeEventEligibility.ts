import { ageFitsUnderPartition, partitionUnderAgeBands } from "@/lib/competitionUnderAgeSystem";
import { meetsEventAgeOrBirthRule, type EventBirthDateFields } from "@/lib/eventBirthDateEligibility";

type UnderPartition = ReturnType<typeof partitionUnderAgeBands>;

/**
 * 種目の年齢可否。大会でアンダー制が有効かつ種目でアンダー判定がオンのときは帯のみを見る（生年月日範囲は無視）。
 */
export function meetsCompetitionEventAgeEligibility(params: {
  competitionUnderAgeEnabled: boolean;
  underPartition: UnderPartition | null;
  eventUnderAgeEligibilityEnabled: boolean;
  event: EventBirthDateFields;
  userDateOfBirth: Date | null;
  seasonalAgeYears: number | null;
}): boolean {
  const {
    competitionUnderAgeEnabled,
    underPartition,
    eventUnderAgeEligibilityEnabled,
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
    return ageFitsUnderPartition(seasonalAgeYears, underPartition);
  }

  return meetsEventAgeOrBirthRule({
    userDateOfBirth,
    userEligibilityAgeYears: seasonalAgeYears,
    event,
  });
}
