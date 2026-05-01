import { describe, expect, it } from "vitest";
import type { StartListHeat } from "@/lib/startListRounds";
import { countCalledMarshalSlotsInHeat } from "@/lib/marshalHeatCalledCount";

describe("countCalledMarshalSlotsInHeat", () => {
  it("counts individuals with effective CALLED when heat is closed", () => {
    const heat: StartListHeat = {
      heatIndex: 1,
      participants: [
        {
          kind: "INDIVIDUAL",
          entryId: "e1",
          userId: "u1",
          name: "A",
          clubId: null,
          clubName: null,
        },
        {
          kind: "INDIVIDUAL",
          entryId: "e2",
          userId: "u2",
          name: "B",
          clubId: null,
          clubName: null,
        },
      ],
    };
    const statusByKey = new Map([
      [`I:e1`, { status: "CALLED", calledAt: null }],
      [`I:e2`, { status: "PENDING", calledAt: null }],
    ]);
    expect(
      countCalledMarshalSlotsInHeat({
        heatMarshalCallClosed: true,
        heat,
        statusByKey,
        teamMembersByTeamId: new Map(),
      })
    ).toBe(1);
  });

  it("team counts as one slot only when every roster member is CALLED", () => {
    const heat: StartListHeat = {
      heatIndex: 1,
      participants: [
        {
          kind: "TEAM",
          teamEntryId: "t1",
          teamName: "Team X",
          clubId: null,
          clubName: null,
          members: [],
        },
      ],
    };
    const statusByKey = new Map([
      [`T:t1:m1`, { status: "CALLED", calledAt: null }],
      [`T:t1:m2`, { status: "CALLED", calledAt: null }],
    ]);
    const teamMembersByTeamId = new Map([
      ["t1", [
        { userId: "m1", label: "a" },
        { userId: "m2", label: "b" },
      ]],
    ]);
    expect(
      countCalledMarshalSlotsInHeat({
        heatMarshalCallClosed: true,
        heat,
        statusByKey,
        teamMembersByTeamId,
      })
    ).toBe(1);
  });

  it("team does not count when any member is not CALLED", () => {
    const heat: StartListHeat = {
      heatIndex: 1,
      participants: [
        {
          kind: "TEAM",
          teamEntryId: "t1",
          teamName: "Team X",
          clubId: null,
          clubName: null,
          members: [],
        },
      ],
    };
    const statusByKey = new Map([
      [`T:t1:m1`, { status: "CALLED", calledAt: null }],
      [`T:t1:m2`, { status: "PENDING", calledAt: null }],
    ]);
    const teamMembersByTeamId = new Map([
      ["t1", [
        { userId: "m1", label: "a" },
        { userId: "m2", label: "b" },
      ]],
    ]);
    expect(
      countCalledMarshalSlotsInHeat({
        heatMarshalCallClosed: true,
        heat,
        statusByKey,
        teamMembersByTeamId,
      })
    ).toBe(0);
  });
});
