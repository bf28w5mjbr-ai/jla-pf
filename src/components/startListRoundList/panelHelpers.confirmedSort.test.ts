import { describe, expect, it } from "vitest";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import { marshalIndividualKey, marshalTeamMemberKey } from "@/lib/dayOpsParticipantKeys";
import {
  confirmedResultSortTierForIndividual,
  confirmedResultSortTierForTeam,
  orderIndividualItemsByConfirmedResultRank,
  orderTeamItemsByConfirmedResultRank,
  type ConfirmedHeatSortCtx,
} from "./panelHelpers";

const heat = 1;

function individualCtx(
  rows: HeatResultCaptureRow[],
  statusByKey: Record<string, string>,
  apiHeat?: HeatMarshalHeatRow
): ConfirmedHeatSortCtx {
  return { displayHeatNumber: heat, rows, statusByKey, apiHeat };
}

function mockApiHeat(
  lanes: Array<{ entryId?: string; teamEntryId?: string; lane: number }>
): HeatMarshalHeatRow {
  return {
    heatIndex: heat,
    callClosedAt: null,
    participants: lanes.map((l) =>
      l.entryId
        ? {
            participantType: "INDIVIDUAL" as const,
            competitionEntryId: l.entryId,
            teamEntryId: null,
            teamMemberUserId: null,
            lane: l.lane,
            status: "CALLED",
            label: l.entryId,
            clubName: null,
          }
        : {
            participantType: "TEAM" as const,
            competitionEntryId: null,
            teamEntryId: l.teamEntryId!,
            teamMemberUserId: "u1",
            lane: l.lane,
            status: "CALLED",
            label: l.teamEntryId!,
            clubName: null,
          }
    ),
  };
}

describe("confirmedResultSortTierForIndividual", () => {
  it("進出・着順・ターミナルを判別する", () => {
    const ctx = individualCtx(
      [
        {
          heat,
          lane: 1,
          rank: null,
          advanceWithoutRank: true,
          entryType: "INDIVIDUAL",
          competitionEntryId: "run",
          teamEntryId: null,
        },
        {
          heat,
          lane: 2,
          rank: 5,
          advanceWithoutRank: false,
          entryType: "INDIVIDUAL",
          competitionEntryId: "ranked",
          teamEntryId: null,
        },
      ],
      { [marshalIndividualKey("dsq")]: "DSQ" }
    );
    expect(confirmedResultSortTierForIndividual("run", ctx)).toBe(0);
    expect(confirmedResultSortTierForIndividual("ranked", ctx)).toBe(1);
    expect(confirmedResultSortTierForIndividual("dsq", ctx)).toBe(3);
  });
});

describe("orderIndividualItemsByConfirmedResultRank", () => {
  it("進出→着順→ターミナルの順（進出はレーン昇順）", () => {
    const rows: HeatResultCaptureRow[] = [
      {
        heat,
        lane: 4,
        rank: null,
        advanceWithoutRank: true,
        entryType: "INDIVIDUAL",
        competitionEntryId: "ru2",
        teamEntryId: null,
      },
      {
        heat,
        lane: 2,
        rank: null,
        advanceWithoutRank: true,
        entryType: "INDIVIDUAL",
        competitionEntryId: "ru1",
        teamEntryId: null,
      },
      {
        heat,
        lane: 1,
        rank: 5,
        advanceWithoutRank: false,
        entryType: "INDIVIDUAL",
        competitionEntryId: "e5",
        teamEntryId: null,
      },
      {
        heat,
        lane: 3,
        rank: 6,
        advanceWithoutRank: false,
        entryType: "INDIVIDUAL",
        competitionEntryId: "e6",
        teamEntryId: null,
      },
    ];
    const apiHeat = mockApiHeat([
      { entryId: "ru1", lane: 2 },
      { entryId: "ru2", lane: 4 },
      { entryId: "e5", lane: 1 },
      { entryId: "e6", lane: 3 },
      { entryId: "dsq", lane: 8 },
    ]);
    const statusByKey = { [marshalIndividualKey("dsq")]: "DSQ" };
    const items = [
      { entryId: "dsq", name: "D" },
      { entryId: "e6", name: "6" },
      { entryId: "ru2", name: "R2" },
      { entryId: "e5", name: "5" },
      { entryId: "ru1", name: "R1" },
    ];
    const sorted = orderIndividualItemsByConfirmedResultRank(
      items,
      heat,
      rows,
      statusByKey,
      apiHeat
    );
    expect(sorted.map((x) => x.entryId)).toEqual(["ru1", "ru2", "e5", "e6", "dsq"]);
  });

  it("着順のみ: rank 昇順のあとターミナル", () => {
    const rows: HeatResultCaptureRow[] = [
      {
        heat,
        lane: 1,
        rank: 2,
        advanceWithoutRank: false,
        entryType: "INDIVIDUAL",
        competitionEntryId: "e2",
        teamEntryId: null,
      },
      {
        heat,
        lane: 2,
        rank: 1,
        advanceWithoutRank: false,
        entryType: "INDIVIDUAL",
        competitionEntryId: "e1",
        teamEntryId: null,
      },
    ];
    const statusByKey = { [marshalIndividualKey("dns")]: "DNS" };
    const items = [
      { entryId: "dns", name: "X" },
      { entryId: "e2", name: "2" },
      { entryId: "e1", name: "1" },
    ];
    const sorted = orderIndividualItemsByConfirmedResultRank(
      items,
      heat,
      rows,
      statusByKey,
      undefined
    );
    expect(sorted.map((x) => x.entryId)).toEqual(["e1", "e2", "dns"]);
  });

  it("同着 rank は ID 順", () => {
    const rows: HeatResultCaptureRow[] = [
      {
        heat,
        lane: 1,
        rank: 2,
        advanceWithoutRank: false,
        entryType: "INDIVIDUAL",
        competitionEntryId: "b",
        teamEntryId: null,
      },
      {
        heat,
        lane: 2,
        rank: 2,
        advanceWithoutRank: false,
        entryType: "INDIVIDUAL",
        competitionEntryId: "a",
        teamEntryId: null,
      },
    ];
    const sorted = orderIndividualItemsByConfirmedResultRank(
      [
        { entryId: "b", name: "B" },
        { entryId: "a", name: "A" },
      ],
      heat,
      rows,
      {},
      undefined
    );
    expect(sorted.map((x) => x.entryId)).toEqual(["a", "b"]);
  });
});

describe("orderTeamItemsByConfirmedResultRank", () => {
  it("構成員 DSQ のチームはターミナル tier", () => {
    const teamId = "t1";
    const statusByKey = {
      [marshalTeamMemberKey(teamId, "u1")]: "DSQ",
    };
    expect(
      confirmedResultSortTierForTeam(
        teamId,
        individualCtx([], statusByKey)
      )
    ).toBe(3);

    const rows: HeatResultCaptureRow[] = [
      {
        heat,
        lane: 1,
        rank: 8,
        advanceWithoutRank: false,
        entryType: "TEAM",
        competitionEntryId: null,
        teamEntryId: "t2",
      },
    ];
    const sorted = orderTeamItemsByConfirmedResultRank(
      [
        { teamEntryId: "t1", teamName: "DSQ", members: [] },
        { teamEntryId: "t2", teamName: "8th", members: [] },
      ],
      heat,
      rows,
      statusByKey,
      mockApiHeat([
        { teamEntryId: "t1", lane: 3 },
        { teamEntryId: "t2", lane: 1 },
      ])
    );
    expect(sorted.map((x) => x.teamEntryId)).toEqual(["t2", "t1"]);
  });
});
