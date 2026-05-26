import { describe, expect, it } from "vitest";
import {
  buildIndividualEventCircleCells,
  getLiveIndividualEventIdsFromEntry,
  isEventMarkedForStartListAlignment,
  shouldHideTeamEntryFromStartListAlignment,
} from "@/lib/startListEntryAlignment";

describe("getLiveIndividualEventIdsFromEntry", () => {
  it("returns unique event ids from items only", () => {
    expect(
      getLiveIndividualEventIdsFromEntry([
        { eventId: "ev1" },
        { eventId: "ev2" },
        { eventId: "ev1" },
      ])
    ).toEqual(["ev1", "ev2"]);
  });
});

describe("isEventMarkedForStartListAlignment", () => {
  const live = new Set(["ev1", "ev2"]);

  it("marks live event without status rows", () => {
    expect(isEventMarkedForStartListAlignment("ev1", live, [])).toBe(true);
  });

  it("does not mark event absent from live items", () => {
    expect(isEventMarkedForStartListAlignment("ev9", live, [])).toBe(false);
  });

  it("does not mark withdrawn DNS for that event", () => {
    expect(
      isEventMarkedForStartListAlignment("ev1", live, [
        {
          eventId: "ev1",
          status: "DNS",
          reason: "棄権（DNS扱い）",
          participantType: "INDIVIDUAL",
        },
      ])
    ).toBe(false);
    expect(
      isEventMarkedForStartListAlignment("ev2", live, [
        {
          eventId: "ev1",
          status: "DNS",
          reason: "棄権",
          participantType: "INDIVIDUAL",
        },
      ])
    ).toBe(true);
  });

  it("does not mark WITHDRAWN for that event", () => {
    expect(
      isEventMarkedForStartListAlignment("ev1", live, [
        { eventId: "ev1", status: "WITHDRAWN", reason: null, participantType: "INDIVIDUAL" },
      ])
    ).toBe(false);
  });
});

describe("buildIndividualEventCircleCells", () => {
  it("returns circle only for aligned events in program order", () => {
    expect(
      buildIndividualEventCircleCells(
        ["ev1", "ev2", "ev3"],
        new Set(["ev1", "ev2"]),
        [
          {
            eventId: "ev2",
            status: "DNS",
            reason: "棄権",
            participantType: "INDIVIDUAL",
          },
        ]
      )
    ).toEqual(["○", "", ""]);
  });
});

describe("shouldHideTeamEntryFromStartListAlignment", () => {
  it("hides team with withdrawal DNS on matching event", () => {
    expect(
      shouldHideTeamEntryFromStartListAlignment("t1", "ev1", [
        {
          eventId: "ev1",
          status: "DNS",
          reason: "管理者棄権",
          participantType: "TEAM",
          teamEntryId: "t1",
        },
      ])
    ).toBe(true);
  });

  it("does not hide team without hide-worthy status", () => {
    expect(
      shouldHideTeamEntryFromStartListAlignment("t1", "ev1", [
        {
          eventId: "ev1",
          status: "PENDING",
          reason: null,
          participantType: "TEAM",
          teamEntryId: "t1",
        },
      ])
    ).toBe(false);
  });
});
