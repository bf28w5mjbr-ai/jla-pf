import { describe, expect, it } from "vitest";
import {
  isTerminalOnlyOfficialRow,
  resolveParticipantTerminalStatusForRound,
  truncateTerminalRemarks,
} from "@/lib/officialResultTerminalSync";

describe("truncateTerminalRemarks", () => {
  it("trims and truncates long reasons", () => {
    const long = "a".repeat(600);
    expect(truncateTerminalRemarks(long)?.length).toBe(500);
  });
});

describe("isTerminalOnlyOfficialRow", () => {
  it("true for terminal status without rank", () => {
    expect(
      isTerminalOnlyOfficialRow({ status: "WITHDRAWN", rank: null, advanceWithoutRank: false })
    ).toBe(true);
  });

  it("false when rank present", () => {
    expect(
      isTerminalOnlyOfficialRow({ status: "DNF", rank: 1, advanceWithoutRank: false })
    ).toBe(false);
  });
});

describe("resolveParticipantTerminalStatusForRound", () => {
  const map = new Map([
    ["I:e1", "DNS"],
    ["I:e2", "DNF"],
    ["T:t1:m1", "DSQ"],
  ]);

  it("resolves individual DNS", () => {
    expect(
      resolveParticipantTerminalStatusForRound(
        { participantType: "INDIVIDUAL", competitionEntryId: "e1", teamEntryId: null },
        map
      )
    ).toBe("DNS");
  });

  it("resolves individual DNF", () => {
    expect(
      resolveParticipantTerminalStatusForRound(
        { participantType: "INDIVIDUAL", competitionEntryId: "e2", teamEntryId: null },
        map
      )
    ).toBe("DNF");
  });

  it("resolves team DSQ from member", () => {
    expect(
      resolveParticipantTerminalStatusForRound(
        { participantType: "TEAM", competitionEntryId: null, teamEntryId: "t1" },
        map
      )
    ).toBe("DSQ");
  });
});
