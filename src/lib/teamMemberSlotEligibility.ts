import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import { meetsCompetitionEventAgeEligibility } from "@/lib/competitionEventAgeEligibility";
import type { Sex } from "@prisma/client";

export type TeamAssignmentEligibleMemberJson = {
  userId: string;
  name: string;
  sex: Sex;
  dateOfBirth: string | null;
};

export type TeamAssignmentCompetitionJson = {
  startDate: string;
  ageCategories: {
    id: string;
    displayOrder: number;
    eligibleBirthDateFrom: string | null;
    eligibleBirthDateTo: string | null;
  }[];
};

export type TeamAssignmentEventJson = {
  sex: Sex;
  minAge: number | null;
  maxAge: number | null;
  eligibleBirthDateFrom: string | null;
  eligibleBirthDateTo: string | null;
  ageCategoryId: string | null;
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

  return meetsCompetitionEventAgeEligibility({
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

/** 種目条件を満たす候補メンバー（割当 UI 用） */
export function filterEligibleMembersForTeamAssignmentEvent(
  members: readonly TeamAssignmentEligibleMemberJson[],
  event: TeamAssignmentEventJson,
  competition: TeamAssignmentCompetitionJson
): TeamAssignmentEligibleMemberJson[] {
  return members.filter((member) =>
    isClubMemberEligibleForTeamAssignmentSlot({
      memberSex: member.sex,
      memberDateOfBirth: member.dateOfBirth ? new Date(member.dateOfBirth) : null,
      event,
      competition,
    })
  );
}

/** Prisma の Event 行（割当に必要な列）をクライアント／API で共通利用する JSON に */
export function prismaEventToTeamAssignmentEventJson(ev: {
  sex: Sex;
  minAge: number | null;
  maxAge: number | null;
  eligibleBirthDateFrom: Date | null;
  eligibleBirthDateTo: Date | null;
  ageCategoryId: string | null;
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
  };
}

export function prismaCompetitionToTeamAssignmentCompetitionJson(c: {
  startDate: Date;
  ageCategories: {
    id: string;
    displayOrder: number;
    eligibleBirthDateFrom: Date | null;
    eligibleBirthDateTo: Date | null;
  }[];
}): TeamAssignmentCompetitionJson {
  return {
    startDate: c.startDate.toISOString(),
    ageCategories: c.ageCategories.map((ac) => ({
      id: ac.id,
      displayOrder: ac.displayOrder,
      eligibleBirthDateFrom: ac.eligibleBirthDateFrom
        ? ac.eligibleBirthDateFrom.toISOString().slice(0, 10)
        : null,
      eligibleBirthDateTo: ac.eligibleBirthDateTo
        ? ac.eligibleBirthDateTo.toISOString().slice(0, 10)
        : null,
    })),
  };
}
