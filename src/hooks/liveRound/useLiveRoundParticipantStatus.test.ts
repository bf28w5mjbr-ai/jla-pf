import { describe, expect, it } from "vitest";
import type { ResultRound } from "@prisma/client";
import {
  buildStatusUpdatedAtByKey,
  type LiveRoundParticipantStatusRow,
} from "@/hooks/liveRound/useLiveRoundParticipantStatus";

describe("buildStatusUpdatedAtByKey", () => {
  const round = "HEAT" as ResultRound;

  it("returns empty when no rows or round", () => {
    expect(buildStatusUpdatedAtByKey([], round)).toEqual({});
    expect(buildStatusUpdatedAtByKey(undefined, null)).toEqual({});
  });

  it("keeps latest updatedAt per participant key for the round", () => {
    const rows: LiveRoundParticipantStatusRow[] = [
      {
        participantType: "INDIVIDUAL",
        competitionEntryId: "e1",
        teamEntryId: null,
        status: "PENDING",
        marshalRound: round,
        updatedAt: new Date("2020-01-01T10:00:00.000Z"),
      },
      {
        participantType: "INDIVIDUAL",
        competitionEntryId: "e1",
        teamEntryId: null,
        status: "CALLED",
        marshalRound: round,
        updatedAt: new Date("2020-01-02T10:00:00.000Z"),
      },
      {
        participantType: "INDIVIDUAL",
        competitionEntryId: "e2",
        teamEntryId: null,
        status: "PENDING",
        marshalRound: "FINAL" as ResultRound,
        updatedAt: new Date("2020-01-03T10:00:00.000Z"),
      },
    ];
    const map = buildStatusUpdatedAtByKey(rows, round);
    expect(map["I:e1"]).toBe("2020-01-02T10:00:00.000Z");
    expect(map["I:e2"]).toBeUndefined();
  });
});
