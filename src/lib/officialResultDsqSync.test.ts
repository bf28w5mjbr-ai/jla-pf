import { describe, expect, it } from "vitest";
import {
  isDsqOnlyOfficialRow,
  isParticipantDsqForRound,
  truncateDsqRemarks,
  toOfficialMarshalParticipantRef,
} from "@/lib/officialResultDsqSync";

describe("truncateDsqRemarks", () => {
  it("trims and truncates long reasons", () => {
    const long = "a".repeat(600);
    expect(truncateDsqRemarks(long)?.length).toBe(500);
  });

  it("returns null for empty", () => {
    expect(truncateDsqRemarks("  ")).toBeNull();
  });
});

describe("isDsqOnlyOfficialRow", () => {
  it("true when DSQ without rank or run-up", () => {
    expect(
      isDsqOnlyOfficialRow({ status: "DSQ", rank: null, advanceWithoutRank: false })
    ).toBe(true);
  });

  it("false when rank present", () => {
    expect(isDsqOnlyOfficialRow({ status: "DSQ", rank: 1, advanceWithoutRank: false })).toBe(
      false
    );
  });
});

describe("isParticipantDsqForRound", () => {
  const map = new Map([
    ["I:e1", "DSQ"],
    ["T:t1:m1", "CALLED"],
    ["T:t1:m2", "DSQ"],
  ]);

  it("detects individual DSQ", () => {
    expect(
      isParticipantDsqForRound(
        { participantType: "INDIVIDUAL", competitionEntryId: "e1", teamEntryId: null },
        map
      )
    ).toBe(true);
  });

  it("detects team DSQ when any member DSQ", () => {
    expect(
      isParticipantDsqForRound(
        { participantType: "TEAM", competitionEntryId: null, teamEntryId: "t1" },
        map
      )
    ).toBe(true);
  });
});

describe("toOfficialMarshalParticipantRef", () => {
  it("strips team member id for official row key", () => {
    expect(
      toOfficialMarshalParticipantRef({
        participantType: "TEAM",
        competitionEntryId: null,
        teamEntryId: "t1",
        teamMemberUserId: "u1",
      })
    ).toEqual({
      participantType: "TEAM",
      competitionEntryId: null,
      teamEntryId: "t1",
    });
  });
});
