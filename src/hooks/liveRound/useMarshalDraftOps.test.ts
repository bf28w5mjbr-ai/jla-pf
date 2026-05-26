import { describe, expect, it } from "vitest";
import { marshalParticipantKey, type HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import { applyMarshalDraftOpsToHeats } from "@/components/startListRoundList/panelHelpers";
import type { MarshalDraftOp } from "@/hooks/liveRound/types";
import type { ResultRound } from "@prisma/client";

describe("useMarshalDraftOps (applyMarshalDraftOpsToHeats integration)", () => {
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

  it("applies CALLED draft op to matching lane", () => {
    const participant = baseHeat.participants[0]!;
    const opKey = marshalParticipantKey(participant);
    const op: MarshalDraftOp = {
      opKey,
      eventId: "ev1",
      round: "HEAT" as ResultRound,
      heatIndex: 1,
      participantType: "INDIVIDUAL",
      competitionEntryId: "e1",
      status: "CALLED",
    };
    const [heat] = applyMarshalDraftOpsToHeats([baseHeat], { [op.opKey]: op });
    expect(heat?.participants[0]?.status).toBe("CALLED");
  });

  it("leaves heats unchanged when draft ops are empty", () => {
    const [heat] = applyMarshalDraftOpsToHeats([baseHeat], {});
    expect(heat?.participants[0]?.status).toBe("PENDING");
  });
});
