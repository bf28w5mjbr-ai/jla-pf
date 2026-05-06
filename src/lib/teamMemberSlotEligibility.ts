import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import {
  competitionUsesUnderAgeSystem,
  partitionUnderBandsForCompetition,
} from "@/lib/competitionUnderAgeSettings";
import { meetsCompetitionEventAgeEligibility } from "@/lib/underAgeEventEligibility";
import { resolveEffectiveUnderBandAllowListForEvent } from "@/lib/underBandAllowList";
import type { Sex } from "@prisma/client";

export type TeamAssignmentCompetitionJson = {
  startDate: string;
  underAgeSystemEnabled: boolean;
  underAgeUThresholds: number[];
  underAgeOpenEnabled: boolean;
  ageCategories: {
    id: string;
    displayOrder: number;
    eligibleBirthDateFrom: string | null;
    eligibleBirthDateTo: string | null;
    underBandKeysEnabled: unknown;
  }[];
};

export type TeamAssignmentEventJson = {
  sex: Sex;
  minAge: number | null;
  maxAge: number | null;
  eligibleBirthDateFrom: string | null;
  eligibleBirthDateTo: string | null;
  ageCategoryId: string | null;
  underBandKeysOverride: unknown;
  underAgeEligibilityEnabled: boolean;
  ageCategory: { id: string; underBandKeysEnabled: unknown } | null;
};

function parseDbDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** メンバー割当: 種目（チーム行）に対してユーザーが性別・年齢条件を満たすか */
export function isClubMemberEligibleForTeamAssignmentSlot(params: {
  memberSex: Sex;
  memberDateOfBirth: Date | null;
  event: TeamAssignmentEventJson;
  competition: TeamAssignmentCompetitionJson;
}): boolean {
  const { memberSex, memberDateOfBirth, event, competition } = params;
  const isMixedEvent = event.sex === "OTHER";
  if (!isMixedEvent && memberSex !== "OTHER" && event.sex !== memberSex) {
    return false;
  }

  const startDate = new Date(competition.startDate);
  const seasonalAgeYears = memberDateOfBirth
    ? getCompetitionEligibilityAgeYears(memberDateOfBirth, startDate)
    : null;

  const underPartition = partitionUnderBandsForCompetition({
    underAgeSystemEnabled: competition.underAgeSystemEnabled,
    underAgeUThresholds: competition.underAgeUThresholds,
    underAgeOpenEnabled: competition.underAgeOpenEnabled,
  });

  return meetsCompetitionEventAgeEligibility({
    competitionUnderAgeEnabled: competitionUsesUnderAgeSystem({
      underAgeSystemEnabled: competition.underAgeSystemEnabled,
      underAgeUThresholds: competition.underAgeUThresholds,
      underAgeOpenEnabled: competition.underAgeOpenEnabled,
    }),
    underPartition: underPartition ?? null,
    eventUnderAgeEligibilityEnabled: event.underAgeEligibilityEnabled ?? true,
    effectiveUnderBandAllowList: resolveEffectiveUnderBandAllowListForEvent({
      underBandKeysOverride: event.underBandKeysOverride,
      ageCategoryId: event.ageCategoryId,
      categoryUnderBandKeysEnabled: event.ageCategory?.underBandKeysEnabled ?? null,
    }),
    event: {
      eligibleBirthDateFrom: parseDbDate(event.eligibleBirthDateFrom),
      eligibleBirthDateTo: parseDbDate(event.eligibleBirthDateTo),
      minAge: event.minAge,
      maxAge: event.maxAge,
    },
    userDateOfBirth: memberDateOfBirth,
    seasonalAgeYears,
  });
}

/** Prisma の Event 行（割当に必要な列）をクライアント／API で共通利用する JSON に */
export function prismaEventToTeamAssignmentEventJson(ev: {
  sex: Sex;
  minAge: number | null;
  maxAge: number | null;
  eligibleBirthDateFrom: Date | null;
  eligibleBirthDateTo: Date | null;
  ageCategoryId: string | null;
  underBandKeysOverride: unknown;
  underAgeEligibilityEnabled: boolean;
  ageCategory: { id: string; underBandKeysEnabled: unknown } | null;
}): TeamAssignmentEventJson {
  return {
    sex: ev.sex,
    minAge: ev.minAge,
    maxAge: ev.maxAge,
    eligibleBirthDateFrom: ev.eligibleBirthDateFrom
      ? ev.eligibleBirthDateFrom.toISOString().slice(0, 10)
      : null,
    eligibleBirthDateTo: ev.eligibleBirthDateTo
      ? ev.eligibleBirthDateTo.toISOString().slice(0, 10)
      : null,
    ageCategoryId: ev.ageCategoryId,
    underBandKeysOverride: ev.underBandKeysOverride,
    underAgeEligibilityEnabled: ev.underAgeEligibilityEnabled,
    ageCategory: ev.ageCategory,
  };
}

export function prismaCompetitionToTeamAssignmentCompetitionJson(c: {
  startDate: Date;
  underAgeSystemEnabled: boolean;
  underAgeUThresholds: number[] | null | unknown;
  underAgeOpenEnabled: boolean | null;
  ageCategories: {
    id: string;
    displayOrder: number;
    eligibleBirthDateFrom: Date | null;
    eligibleBirthDateTo: Date | null;
    underBandKeysEnabled: unknown;
  }[];
}): TeamAssignmentCompetitionJson {
  const thresholds = Array.isArray(c.underAgeUThresholds)
    ? c.underAgeUThresholds.filter((n): n is number => Number.isInteger(n))
    : [];
  return {
    startDate: c.startDate.toISOString(),
    underAgeSystemEnabled: Boolean(c.underAgeSystemEnabled),
    underAgeUThresholds: thresholds,
    underAgeOpenEnabled: c.underAgeOpenEnabled ?? true,
    ageCategories: c.ageCategories.map((ac) => ({
      id: ac.id,
      displayOrder: ac.displayOrder,
      eligibleBirthDateFrom: ac.eligibleBirthDateFrom
        ? ac.eligibleBirthDateFrom.toISOString().slice(0, 10)
        : null,
      eligibleBirthDateTo: ac.eligibleBirthDateTo
        ? ac.eligibleBirthDateTo.toISOString().slice(0, 10)
        : null,
      underBandKeysEnabled: ac.underBandKeysEnabled,
    })),
  };
}
