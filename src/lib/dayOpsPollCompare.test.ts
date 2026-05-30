import { describe, expect, it } from "vitest";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import { marshalParticipantKey } from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import {
  confirmedHeatsEqual,
  mergeConfirmedHeats,
  marshalHeatStatusSignature,
  marshalHeatsSemanticEqual,
  participantStatusPollRowsEqual,
  resultCaptureRowsEqual,
} from "@/lib/dayOpsPollCompare";

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

describe("dayOpsPollCompare", () => {
  it("marshalHeatsSemanticEqual ignores reference changes", () => {
    const a = [{ ...baseHeat, participants: [...baseHeat.participants] }];
    const b = [{ ...baseHeat, participants: [...baseHeat.participants] }];
    expect(marshalHeatsSemanticEqual(a, b)).toBe(true);
  });

  it("marshalHeatStatusSignature detects status change", () => {
    const pending = [baseHeat];
    const called: HeatMarshalHeatRow[] = [
      {
        ...baseHeat,
        participants: [{ ...baseHeat.participants[0]!, status: "CALLED" }],
      },
    ];
    expect(marshalHeatStatusSignature(pending)).not.toBe(marshalHeatStatusSignature(called));
  });

  it("resultCaptureRowsEqual compares rank and heat", () => {
    const row: HeatResultCaptureRow = {
      heat: 1,
      lane: 1,
      rank: 1,
      entryType: "INDIVIDUAL",
      competitionEntryId: "e1",
      teamEntryId: null,
    };
    expect(resultCaptureRowsEqual([row], [{ ...row }])).toBe(true);
    expect(resultCaptureRowsEqual([row], [{ ...row, rank: 2 }])).toBe(false);
  });

  it("participantStatusPollRowsEqual compares updatedAt", () => {
    const row = {
      participantType: "INDIVIDUAL",
      competitionEntryId: "e1",
      teamEntryId: null,
      status: "CALLED",
      marshalRound: "HEAT",
      updatedAt: new Date("2026-05-30T00:00:00.000Z"),
    };
    expect(
      participantStatusPollRowsEqual([row], [{ ...row, updatedAt: new Date("2026-05-30T00:00:00.000Z") }])
    ).toBe(true);
    expect(
      participantStatusPollRowsEqual([row], [{ ...row, updatedAt: new Date("2026-05-30T01:00:00.000Z") }])
    ).toBe(false);
  });

  it("confirmedHeatsEqual", () => {
    expect(confirmedHeatsEqual([1, 2], [1, 2])).toBe(true);
    expect(confirmedHeatsEqual([1], [1, 2])).toBe(false);
  });

  it("mergeConfirmedHeats keeps optimistic heats until server catches up", () => {
    expect(mergeConfirmedHeats([1], [])).toEqual([1]);
    expect(mergeConfirmedHeats([1], [2])).toEqual([1, 2]);
    expect(mergeConfirmedHeats([], [2])).toEqual([2]);
  });

  it("marshalHeatStatusSignature includes opKey", () => {
    const sig = marshalHeatStatusSignature([baseHeat]);
    expect(sig).toContain(marshalParticipantKey(baseHeat.participants[0]!));
  });
});
