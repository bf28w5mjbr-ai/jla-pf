/**
 * 個人エントリーの資格申告ゲートと、大会資格要件の確認ラベル。
 * DB を参照しない。期限切れ拒否は申告ゲートでは行わない。
 */

import { calendarDayKeyInTokyo } from "@/lib/competitionScheduleDays";
import { COMPETITION_ADMIN_DATE_TIME_ZONE } from "@/lib/datetimeLocal";
import {
  confirmationFieldEquals,
  isActiveOfficialConfirmation,
  QUALIFICATION_DECLARED_FOR_ENTRY_STATUSES,
  QUALIFICATION_REQUIREMENTS_PENDING_LABEL,
  QUALIFICATION_REQUIREMENTS_VERIFIED_LABEL,
  type QualificationConfirmationSnapshot,
} from "@/lib/qualificationOwnerRules";

export { QUALIFICATION_DECLARED_FOR_ENTRY_STATUSES };

export type QualificationForCompetitionConfirmation = QualificationConfirmationSnapshot & {
  kind: string;
  status: string;
  templateId: string;
  certNumber: string | null;
  expiryDate: Date | string | null;
};

export function normalizeQualificationKindForEntry(
  value: string | null | undefined
): string {
  const raw = value ?? "";
  try {
    return raw
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s_\-./()（）・]+/g, "");
  } catch {
    return raw.toLowerCase().replace(/[\s_\-./()（）・]+/g, "");
  }
}

export function qualificationKindMatchesRequirement(
  value: string,
  required: string
): boolean {
  const normalizedValue = normalizeQualificationKindForEntry(value);
  const normalizedRequired = normalizeQualificationKindForEntry(required);
  if (!normalizedValue || !normalizedRequired) return false;
  return (
    normalizedValue === normalizedRequired ||
    normalizedValue.includes(normalizedRequired) ||
    normalizedRequired.includes(normalizedValue)
  );
}

export function declaredKindsMeetEntryRequirements(
  declaredKinds: readonly string[],
  requiredKinds: readonly string[]
): boolean {
  if (requiredKinds.length === 0) return true;
  return requiredKinds.every((req) =>
    declaredKinds.some((kind) => qualificationKindMatchesRequirement(kind, req))
  );
}

function dateMs(value: Date | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** 期限不明は無期限ではない。大会要件の確認済み断定には使わない。 */
export function isKnownQualificationExpiryDate(
  expiryDate: Date | string | null | undefined
): boolean {
  return dateMs(expiryDate) != null;
}

/**
 * 大会資格の「開催初日まで有効」判定に使う壁時計。
 * Competition に timezone 列はなく、開催日は date 入力を DateTime として保存する。
 * 日程・年齢判定と同じ Asia/Tokyo 暦日を使う（会場住所からの推定はしない）。
 */
export const COMPETITION_QUALIFICATION_AS_OF_TIME_ZONE = COMPETITION_ADMIN_DATE_TIME_ZONE;

/**
 * 大会開催初日（startDate の Asia/Tokyo 暦日）を資格要件確認の基準日にする。終了日は使わない。
 */
export const COMPETITION_START_DATE_AS_QUALIFICATION_AS_OF_APPROVED = true;

export function competitionQualificationAsOfCalendarDay(
  competitionStartDate: Date | string | null | undefined
): string | null {
  const ms = dateMs(competitionStartDate);
  if (ms == null) return null;
  return calendarDayKeyInTokyo(new Date(ms));
}

export function qualificationExpiryCalendarDay(
  expiryDate: Date | string | null | undefined
): string | null {
  const ms = dateMs(expiryDate);
  if (ms == null) return null;
  return calendarDayKeyInTokyo(new Date(ms));
}

/** 有効期限の暦日が開催初日と同じかそれより後なら、初日まで有効。 */
export function qualificationExpiryCoversCompetitionFirstDay(input: {
  expiryDate: Date | string | null | undefined;
  competitionStartDate: Date | string | null | undefined;
}): boolean {
  const expiryDay = qualificationExpiryCalendarDay(input.expiryDate);
  const firstDay = competitionQualificationAsOfCalendarDay(input.competitionStartDate);
  if (expiryDay == null || firstDay == null) return false;
  return expiryDay >= firstDay;
}

export function resolveCompetitionQualificationAsOfDate(input?: {
  competitionStartDate?: Date | string | null;
  /** 複数日大会でも基準は初日。渡されても使わない。 */
  competitionEndDate?: Date | string | null;
  startDatePolicyApproved?: boolean;
}): Date | null {
  const policyApproved =
    input?.startDatePolicyApproved ?? COMPETITION_START_DATE_AS_QUALIFICATION_AS_OF_APPROVED;
  if (!policyApproved) return null;
  const ms = dateMs(input?.competitionStartDate);
  return ms == null ? null : new Date(ms);
}

/**
 * 大会資格要件の公式確認。保有確認に加え、基準日が確定し期限が既知で開催初日まで有効であること。
 */
export function qualificationMeetsCompetitionRequirementConfirmation(input: {
  qualification: QualificationForCompetitionConfirmation;
  requiredKind: string;
  competitionAsOfDate: Date | string | null | undefined;
}): boolean {
  if (
    !qualificationExpiryCoversCompetitionFirstDay({
      expiryDate: input.qualification.expiryDate,
      competitionStartDate: input.competitionAsOfDate,
    })
  ) {
    return false;
  }
  if (!confirmationFieldEquals(input.qualification.confirmedExpiryDate, input.qualification.expiryDate)) {
    return false;
  }
  return (
    isActiveOfficialConfirmation(input.qualification) &&
    qualificationKindMatchesRequirement(input.qualification.kind, input.requiredKind)
  );
}

export function qualificationRequirementConfirmationLabel(input: {
  requiredKinds: readonly string[];
  qualifications: ReadonlyArray<QualificationForCompetitionConfirmation>;
  competitionAsOfDate: Date | string | null | undefined;
}): string | null {
  if (input.requiredKinds.length === 0) return null;
  const verified = input.requiredKinds.every((req) =>
    input.qualifications.some((row) =>
      qualificationMeetsCompetitionRequirementConfirmation({
        qualification: row,
        requiredKind: req,
        competitionAsOfDate: input.competitionAsOfDate,
      })
    )
  );
  return verified
    ? QUALIFICATION_REQUIREMENTS_VERIFIED_LABEL
    : QUALIFICATION_REQUIREMENTS_PENDING_LABEL;
}
