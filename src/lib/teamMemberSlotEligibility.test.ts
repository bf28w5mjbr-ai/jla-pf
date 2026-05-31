import { describe, expect, it } from "vitest";
import {
  filterEligibleMembersForTeamAssignmentEvent,
  isClubMemberEligibleForTeamAssignmentSlot,
  type TeamAssignmentCompetitionJson,
  type TeamAssignmentEventJson,
} from "./teamMemberSlotEligibility";

function competitionBase(): TeamAssignmentCompetitionJson {
  return {
    startDate: "2026-07-01T00:00:00.000Z",
    ageCategories: [],
  };
}

function eventBase(over: Partial<TeamAssignmentEventJson> = {}): TeamAssignmentEventJson {
  return {
    sex: "MALE",
    minAge: null,
    maxAge: null,
    eligibleBirthDateFrom: null,
    eligibleBirthDateTo: null,
    ageCategoryId: null,
    ...over,
  };
}

describe("isClubMemberEligibleForTeamAssignmentSlot", () => {
  it("男子種目に女性メンバーは不可", () => {
    expect(
      isClubMemberEligibleForTeamAssignmentSlot({
        memberSex: "FEMALE",
        memberDateOfBirth: new Date("2010-01-01T00:00:00+09:00"),
        event: eventBase({ sex: "MALE", minAge: 10, maxAge: 18 }),
        competition: competitionBase(),
      })
    ).toBe(false);
  });

  it("混合種目は性別で弾かない（年齢は満たす）", () => {
    expect(
      isClubMemberEligibleForTeamAssignmentSlot({
        memberSex: "FEMALE",
        memberDateOfBirth: new Date("2010-01-01T00:00:00+09:00"),
        event: eventBase({ sex: "OTHER", minAge: 10, maxAge: 18 }),
        competition: competitionBase(),
      })
    ).toBe(true);
  });

  it("満年齢が種目の maxAge を超えると不可", () => {
    const dob = new Date("2014-08-15T12:00:00+09:00");
    expect(
      isClubMemberEligibleForTeamAssignmentSlot({
        memberSex: "MALE",
        memberDateOfBirth: dob,
        event: eventBase({ sex: "MALE", minAge: 8, maxAge: 10 }),
        competition: competitionBase(),
      })
    ).toBe(false);
  });

  it("満年齢が種目の範囲内なら可", () => {
    const dob = new Date("2014-08-15T12:00:00+09:00");
    expect(
      isClubMemberEligibleForTeamAssignmentSlot({
        memberSex: "MALE",
        memberDateOfBirth: dob,
        event: eventBase({ sex: "MALE", minAge: 8, maxAge: 15 }),
        competition: competitionBase(),
      })
    ).toBe(true);
  });
});

describe("filterEligibleMembersForTeamAssignmentEvent", () => {
  it("男子種目では女性を除外する", () => {
    const members = [
      {
        userId: "m1",
        name: "男子",
        sex: "MALE" as const,
        dateOfBirth: "2010-01-01T00:00:00.000Z",
      },
      {
        userId: "f1",
        name: "女子",
        sex: "FEMALE" as const,
        dateOfBirth: "2010-01-01T00:00:00.000Z",
      },
    ];
    const filtered = filterEligibleMembersForTeamAssignmentEvent(
      members,
      eventBase({ sex: "MALE", minAge: 10, maxAge: 18 }),
      competitionBase()
    );
    expect(filtered.map((m) => m.userId)).toEqual(["m1"]);
  });
});
