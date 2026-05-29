import { describe, expect, it } from "vitest";
import {
  mergeNewHeatHeadOntoPreviousTailForEvent,
  type StartListSnapshotPayload,
} from "@/lib/startListSnapshot";

type SnapshotEvent = StartListSnapshotPayload["events"][number];

function heatRound(eventId: string): SnapshotEvent["rounds"][number] {
  return {
    round: "HEAT",
    generatedAt: "2020-01-01T00:00:00.000Z",
    generatedBy: "RECORD_CAPTURE",
    heats: [
      {
        heatIndex: 1,
        participants: [
          {
            kind: "INDIVIDUAL",
            entryId: `${eventId}-e1`,
            userId: "u1",
            name: "P1",
            clubId: null,
            clubName: null,
          },
        ],
      },
    ],
  };
}

describe("mergeNewHeatHeadOntoPreviousTailForEvent", () => {
  it("RESULT_BASED の tail を破棄し、それ以外の tail は残す", () => {
    const old: SnapshotEvent = {
      eventId: "ev1",
      name: "種目",
      sex: "MALE",
      type: "INDIVIDUAL",
      rounds: [
        heatRound("old"),
        {
          round: "SEMI",
          generatedAt: "2020-01-02T00:00:00.000Z",
          generatedBy: "RESULT_BASED",
          heats: [{ heatIndex: 1, participants: [] }],
        },
        {
          round: "FINAL",
          generatedAt: "2020-01-03T00:00:00.000Z",
          generatedBy: "BASELINE",
          heats: [{ heatIndex: 1, participants: [] }],
        },
      ],
    };
    const fresh: SnapshotEvent = {
      ...old,
      rounds: [heatRound("fresh")],
    };
    const { event, droppedResultBasedRounds } = mergeNewHeatHeadOntoPreviousTailForEvent(old, fresh);
    expect(droppedResultBasedRounds).toEqual(["SEMI"]);
    expect(event.rounds.map((r) => r.round)).toEqual(["HEAT", "FINAL"]);
    expect(event.rounds[0]!.heats[0]!.participants[0]).toMatchObject({ entryId: "fresh-e1" });
    expect(event.rounds[1]!.generatedBy).toBe("BASELINE");
  });

  it("tail が無いときは fresh をそのまま返す", () => {
    const fresh: SnapshotEvent = {
      eventId: "ev1",
      name: "種目",
      sex: "MALE",
      type: "INDIVIDUAL",
      rounds: [heatRound("fresh")],
    };
    const { event, droppedResultBasedRounds } = mergeNewHeatHeadOntoPreviousTailForEvent(
      undefined,
      fresh
    );
    expect(droppedResultBasedRounds).toEqual([]);
    expect(event).toEqual(fresh);
  });
});
