import { describe, expect, it } from "vitest";
import { isTeamEntryMarshalAssignmentBlockedForLatestPlacement } from "./teamMemberAssignmentWindow";

describe("isTeamEntryMarshalAssignmentBlockedForLatestPlacement", () => {
  const eventId = "ev-1";
  const closed = new Set(["ev-1:HEAT:1", "ev-1:SEMI:2", "ev-1:FINAL:0"]);

  it("未配置のときはブロックしない", () => {
    expect(
      isTeamEntryMarshalAssignmentBlockedForLatestPlacement({
        eventId,
        roundsInSnapshotOrder: ["HEAT", "SEMI"],
        resolveHeatIndex: () => null,
        closedMarshalHeatKeys: closed,
      })
    ).toBe(false);
  });

  it("予選のみ配置・予選締切済みならブロック", () => {
    expect(
      isTeamEntryMarshalAssignmentBlockedForLatestPlacement({
        eventId,
        roundsInSnapshotOrder: ["HEAT"],
        resolveHeatIndex: (round) => (round === "HEAT" ? 1 : null),
        closedMarshalHeatKeys: closed,
      })
    ).toBe(true);
  });

  it("予選と決勝に配置があり予選のみ締切済みならブロックしない", () => {
    expect(
      isTeamEntryMarshalAssignmentBlockedForLatestPlacement({
        eventId,
        roundsInSnapshotOrder: ["HEAT", "FINAL"],
        resolveHeatIndex: (round) => {
          if (round === "HEAT") return 1;
          if (round === "FINAL") return 0;
          return null;
        },
        closedMarshalHeatKeys: new Set(["ev-1:HEAT:1"]),
      })
    ).toBe(false);
  });

  it("最進ラウンド（決勝）が締切済みならブロック", () => {
    expect(
      isTeamEntryMarshalAssignmentBlockedForLatestPlacement({
        eventId,
        roundsInSnapshotOrder: ["HEAT", "FINAL"],
        resolveHeatIndex: (round) => {
          if (round === "HEAT") return 1;
          if (round === "FINAL") return 0;
          return null;
        },
        closedMarshalHeatKeys: closed,
      })
    ).toBe(true);
  });
});
