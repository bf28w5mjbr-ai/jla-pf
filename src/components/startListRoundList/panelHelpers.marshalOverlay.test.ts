import { describe, expect, it } from "vitest";
import { marshalParticipantKey, type HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import {
  applyMarshalDraftOpsToHeats,
  mergeListMarshalHeatsOnRefetch,
  mergeMarshalHeatOverlayOps,
  pruneMarshalCommittedOps,
} from "./panelHelpers";
import type { MarshalDraftOp } from "@/hooks/liveRound/types";
import type { ResultRound } from "@prisma/client";

const baseHeat: HeatMarshalHeatRow = {
  heatIndex: 1,
  callClosedAt: null,
  participants: [
    {
      lane: 1,
      status: "PENDING",
      participantType: "INDIVIDUAL",
      competitionEntryId: "e1",
      label: "A",
      clubName: null,
    },
  ],
};

function calledOp(): MarshalDraftOp {
  const participant = baseHeat.participants[0]!;
  return {
    opKey: marshalParticipantKey(participant),
    eventId: "ev1",
    round: "HEAT" as ResultRound,
    heatIndex: 1,
    participantType: "INDIVIDUAL",
    competitionEntryId: "e1",
    status: "CALLED",
  };
}

describe("mergeMarshalHeatOverlayOps", () => {
  it("draft overrides committed for the same opKey", () => {
    const op = calledOp();
    const pendingOp = { ...op, status: "PENDING" as const };
    const merged = mergeMarshalHeatOverlayOps({ [op.opKey]: pendingOp }, { [op.opKey]: op });
    expect(merged[op.opKey]?.status).toBe("PENDING");
  });
});

describe("pruneMarshalCommittedOps", () => {
  it("removes committed op when server status matches", () => {
    const op = calledOp();
    const calledHeat = applyMarshalDraftOpsToHeats([baseHeat], { [op.opKey]: op });
    const pruned = pruneMarshalCommittedOps(calledHeat, { [op.opKey]: op });
    expect(Object.keys(pruned)).toHaveLength(0);
  });

  it("keeps committed op when server is still PENDING", () => {
    const op = calledOp();
    const pruned = pruneMarshalCommittedOps([baseHeat], { [op.opKey]: op });
    expect(pruned[op.opKey]?.status).toBe("CALLED");
  });
});

describe("mergeListMarshalHeatsOnRefetch", () => {
  it("preserves local CALLED when poll returns PENDING", () => {
    const op = calledOp();
    const prev = applyMarshalDraftOpsToHeats([baseHeat], { [op.opKey]: op });
    const merged = mergeListMarshalHeatsOnRefetch(prev, [baseHeat]);
    expect(merged[0]?.participants[0]?.status).toBe("CALLED");
  });

  it("accepts server CALLED from poll", () => {
    const op = calledOp();
    const prev = applyMarshalDraftOpsToHeats([baseHeat], { [op.opKey]: op });
    const serverCalled = applyMarshalDraftOpsToHeats([baseHeat], { [op.opKey]: op });
    const merged = mergeListMarshalHeatsOnRefetch(prev, serverCalled);
    expect(merged[0]?.participants[0]?.status).toBe("CALLED");
  });
});
