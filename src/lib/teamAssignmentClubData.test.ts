import { describe, expect, it } from "vitest";
import {
  buildAssignmentsForClub,
  type TeamAssignmentClubPayload,
} from "@/lib/teamAssignmentClubData";
import type {
  TeamAssignmentCompetitionJson,
  TeamAssignmentEligibleMemberJson,
  TeamAssignmentEventJson,
} from "@/lib/teamMemberSlotEligibility";

function competitionJson(): TeamAssignmentCompetitionJson {
  return {
    startDate: "2026-07-01T00:00:00.000Z",
    ageCategories: [],
  };
}

function eventJson(over: Partial<TeamAssignmentEventJson> = {}): TeamAssignmentEventJson {
  return {
    sex: "MALE",
    minAge: 10,
    maxAge: 18,
    eligibleBirthDateFrom: null,
    eligibleBirthDateTo: null,
    ageCategoryId: null,
    ...over,
  };
}

describe("buildAssignmentsForClub", () => {
  const clubEligibleMembers: TeamAssignmentEligibleMemberJson[] = [
    {
      userId: "u-male",
      name: "男子 A",
      sex: "MALE",
      dateOfBirth: "2010-01-01T00:00:00.000Z",
    },
    {
      userId: "u-female",
      name: "女子 B",
      sex: "FEMALE",
      dateOfBirth: "2010-01-01T00:00:00.000Z",
    },
  ];

  it("種目条件を満たす候補のみ eligibleMembers に含める", () => {
    const eventsById = { e1: eventJson({ sex: "MALE" }) };
    const assignments = buildAssignmentsForClub({
      teamEntries: [
        {
          id: "te1",
          clubId: "c1",
          eventId: "e1",
          teamName: "Team A",
          event: {
            id: "e1",
            name: "男子リレー",
            sex: "MALE",
            minAge: 10,
            maxAge: 18,
            eligibleBirthDateFrom: null,
            eligibleBirthDateTo: null,
            ageCategoryId: null,
            teamRelayPositionCount: 2,
            teamRelayPositionNames: null,
          },
          members: [],
        },
      ],
      clubEligibleMembers,
      competitionJson: competitionJson(),
      eventsById,
    });

    expect(assignments).toHaveLength(1);
    expect(assignments[0].eligibleMembers.map((m) => m.userId)).toEqual(["u-male"]);
  });

  it("既に割当中のメンバーは条件外でも候補に残す", () => {
    const eventsById = { e1: eventJson({ sex: "MALE" }) };
    const assignments = buildAssignmentsForClub({
      teamEntries: [
        {
          id: "te1",
          clubId: "c1",
          eventId: "e1",
          teamName: "Team A",
          event: {
            id: "e1",
            name: "男子リレー",
            sex: "MALE",
            minAge: 10,
            maxAge: 18,
            eligibleBirthDateFrom: null,
            eligibleBirthDateTo: null,
            ageCategoryId: null,
            teamRelayPositionCount: 2,
            teamRelayPositionNames: null,
          },
          members: [
            { userId: "u-female", order: 1, role: "ATHLETE" },
            { userId: "u-male", order: 2, role: "ATHLETE" },
          ],
        },
      ],
      clubEligibleMembers,
      competitionJson: competitionJson(),
      eventsById,
    });

    const ids = assignments[0].eligibleMembers.map((m) => m.userId).sort();
    expect(ids).toEqual(["u-female", "u-male"]);
  });
});

describe("TeamAssignmentClubPayload shape", () => {
  it("型 export が利用可能", () => {
    const sample: TeamAssignmentClubPayload = {
      assignments: [],
      eligibleMembers: [],
      marshalBlockByTeamEntryId: {},
      teamAssignmentEventsById: {},
    };
    expect(sample.assignments).toEqual([]);
  });
});
