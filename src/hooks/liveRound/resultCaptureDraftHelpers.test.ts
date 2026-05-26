import { describe, expect, it } from "vitest";
import {
  countResultDraftsForHeatFromOps,
  rankedParticipantKeysForHeatFromRows,
} from "@/hooks/liveRound/resultCaptureDraftHelpers";
import type { ResultDraftOp } from "@/hooks/liveRound/types";

describe("countResultDraftsForHeatFromOps", () => {
  it("counts ops for the given heat only", () => {
    const ops: Record<string, ResultDraftOp> = {
      a: {
        opKey: "a",
        heatIndex: 1,
        tieWithPrevious: false,
        inputOrder: "asc",
        draftSequence: 1,
        participantType: "INDIVIDUAL",
        competitionEntryId: "e1",
      },
      b: {
        opKey: "b",
        heatIndex: 2,
        tieWithPrevious: false,
        inputOrder: "asc",
        draftSequence: 2,
        participantType: "INDIVIDUAL",
        competitionEntryId: "e2",
      },
      c: {
        opKey: "c",
        heatIndex: 1,
        tieWithPrevious: true,
        inputOrder: "desc",
        draftSequence: 3,
        participantType: "TEAM",
        teamEntryId: "t1",
      },
    };
    expect(countResultDraftsForHeatFromOps(ops, 1)).toBe(2);
    expect(countResultDraftsForHeatFromOps(ops, 2)).toBe(1);
    expect(countResultDraftsForHeatFromOps(ops, 3)).toBe(0);
  });
});

describe("rankedParticipantKeysForHeatFromRows", () => {
  it("returns participant keys sorted by rank for the heat", () => {
    const keys = rankedParticipantKeysForHeatFromRows(
      [
        {
          heat: 1,
          lane: 3,
          rank: 3,
          entryType: "INDIVIDUAL",
          competitionEntryId: "e3",
          teamEntryId: null,
        },
        {
          heat: 1,
          lane: 1,
          rank: 1,
          entryType: "INDIVIDUAL",
          competitionEntryId: "e1",
          teamEntryId: null,
        },
        {
          heat: 2,
          lane: 1,
          rank: 1,
          entryType: "INDIVIDUAL",
          competitionEntryId: "e9",
          teamEntryId: null,
        },
        {
          heat: 1,
          lane: 2,
          rank: 2,
          entryType: "INDIVIDUAL",
          competitionEntryId: "e2",
          teamEntryId: null,
        },
        {
          heat: 1,
          lane: 4,
          rank: null,
          entryType: "INDIVIDUAL",
          competitionEntryId: "e0",
          teamEntryId: null,
        },
      ],
      1
    );
    expect(keys).toEqual(["I:e1", "I:e2", "I:e3"]);
  });
});
