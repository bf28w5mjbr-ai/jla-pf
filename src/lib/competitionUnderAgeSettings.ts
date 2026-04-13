import type { Competition } from "@prisma/client";
import { partitionUnderAgeBands } from "@/lib/competitionUnderAgeSystem";

/** DB の大会アンダー制フラグ＋しきい値（Prisma 列） */
export type CompetitionUnderAgeDbFields = Pick<
  Competition,
  "underAgeSystemEnabled" | "underAgeUThresholds" | "underAgeOpenEnabled"
>;

export function competitionUsesUnderAgeSystem(c: CompetitionUnderAgeDbFields): boolean {
  return Boolean(c.underAgeSystemEnabled);
}

export function underAgePartitionInputFromCompetition(
  c: CompetitionUnderAgeDbFields
): { uThresholds: number[]; openEnabled: boolean } | null {
  if (!competitionUsesUnderAgeSystem(c)) return null;
  const uThresholds = Array.isArray(c.underAgeUThresholds)
    ? c.underAgeUThresholds.filter((n) => Number.isInteger(n) && n >= 0)
    : [];
  return { uThresholds, openEnabled: c.underAgeOpenEnabled ?? true };
}

/** 大会 DB 行から U/OPEN の帯分割（無効な大会は null） */
export function partitionUnderBandsForCompetition(
  c: CompetitionUnderAgeDbFields
): ReturnType<typeof partitionUnderAgeBands> | null {
  const input = underAgePartitionInputFromCompetition(c);
  if (!input) return null;
  return partitionUnderAgeBands(input.uThresholds, input.openEnabled);
}
