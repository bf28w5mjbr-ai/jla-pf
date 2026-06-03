import { describe, expect, it } from "vitest";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import { marshalIndividualKey } from "@/lib/dayOpsParticipantKeys";
import {
  liveResultSortTierForIndividual,
  orderIndividualItemsByLiveResultRank,
} from "./panelHelpers";

const heat = 1;

function mockApiHeat(
  lanes: Array<{ entryId: string; lane: number }>
): HeatMarshalHeatRow {
  return {
    heatIndex: heat,
    callClosedAt: "2026-01-01T00:00:00.000Z",
    participants: lanes.map((l) => ({
      participantType: "INDIVIDUAL" as const,
      competitionEntryId: l.entryId,
      teamEntryId: null,
      teamMemberUserId: null,
      lane: l.lane,
      status: "CALLED",
      label: l.entryId,
      clubName: null,
    })),
  };
}

describe("orderIndividualItemsByLiveResultRank", () => {
  it("サーバー着順 2,1,3 を 1,2,3 順に並べる", () => {
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
      {
        heat,
        lane: 3,
        rank: 3,
        advanceWithoutRank: false,
        entryType: "INDIVIDUAL",
        competitionEntryId: "e3",
        teamEntryId: null,
      },
    ];
    const items = [
      { entryId: "e2", name: "2" },
      { entryId: "e3", name: "3" },
      { entryId: "e1", name: "1" },
    ];
    const sorted = orderIndividualItemsByLiveResultRank(items, {
      displayHeatNumber: heat,
      rows,
      includeProvisional: true,
    });
    expect(sorted.map((x) => x.entryId)).toEqual(["e1", "e2", "e3"]);
  });

  it("draft のみでも draftSequence 順に並べる", () => {
    const apiHeat = mockApiHeat([
      { entryId: "e1", lane: 1 },
      { entryId: "e2", lane: 2 },
      { entryId: "e3", lane: 3 },
    ]);
    const items = [
      { entryId: "e3", name: "3" },
      { entryId: "e1", name: "1" },
      { entryId: "e2", name: "2" },
    ];
    const sorted = orderIndividualItemsByLiveResultRank(items, {
      displayHeatNumber: heat,
      rows: [],
      statusByKey: {},
      apiHeat,
      resultDraftOps: {
        [marshalIndividualKey("e2")]: { heatIndex: heat, draftSequence: 1 },
        [marshalIndividualKey("e1")]: { heatIndex: heat, draftSequence: 2 },
        [marshalIndividualKey("e3")]: { heatIndex: heat, draftSequence: 3 },
      },
      resultInputOrder: "asc",
      includeProvisional: true,
    });
    expect(sorted.map((x) => x.entryId)).toEqual(["e2", "e1", "e3"]);
  });

  it("着順あり → 未着順（レーン昇順）→ ターミナル", () => {
    const rows: HeatResultCaptureRow[] = [
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
    const apiHeat = mockApiHeat([
      { entryId: "e1", lane: 2 },
      { entryId: "e2", lane: 4 },
      { entryId: "e3", lane: 1 },
      { entryId: "dsq", lane: 8 },
    ]);
    const statusByKey = { [marshalIndividualKey("dsq")]: "DSQ" };
    const items = [
      { entryId: "dsq", name: "D" },
      { entryId: "e2", name: "U2" },
      { entryId: "e3", name: "U1" },
      { entryId: "e1", name: "1" },
    ];
    const sorted = orderIndividualItemsByLiveResultRank(items, {
      displayHeatNumber: heat,
      rows,
      statusByKey,
      apiHeat,
      includeProvisional: true,
    });
    expect(sorted.map((x) => x.entryId)).toEqual(["e1", "e3", "e2", "dsq"]);
  });

  it("resultInputOrder desc で仮着順を反映する", () => {
    const apiHeat = mockApiHeat([
      { entryId: "e1", lane: 1 },
      { entryId: "e2", lane: 2 },
      { entryId: "e3", lane: 3 },
    ]);
    const draftOps = {
      [marshalIndividualKey("e1")]: { heatIndex: heat, draftSequence: 1 },
      [marshalIndividualKey("e2")]: { heatIndex: heat, draftSequence: 2 },
    };
    const sortOpts = {
      displayHeatNumber: heat,
      rows: [] as HeatResultCaptureRow[],
      statusByKey: {},
      apiHeat,
      resultDraftOps: draftOps,
      resultInputOrder: "desc" as const,
      includeProvisional: true,
    };
    const items = [
      { entryId: "e1", name: "1" },
      { entryId: "e2", name: "2" },
      { entryId: "e3", name: "3" },
    ];
    const sorted = orderIndividualItemsByLiveResultRank(items, sortOpts);
    // 下位から入力: 1番目チェック=e2相当の2位、2番目=e1相当の3位
    expect(sorted.map((x) => x.entryId)).toEqual(["e2", "e1", "e3"]);
    expect(liveResultSortTierForIndividual("e1", sortOpts)).toBe(1);
    expect(liveResultSortTierForIndividual("e3", sortOpts)).toBe(3);
  });
});
