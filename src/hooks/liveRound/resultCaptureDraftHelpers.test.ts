import { describe, expect, it } from "vitest";
import {
  countResultDraftsForHeatFromOps,
  draftsPendingAppendForHeat,
  rankedParticipantKeysForHeatFromRows,
  resultDraftHeatsSyncKeyFromHeats,
  resultDraftOpsForHeatFromServerRow,
} from "@/hooks/liveRound/resultCaptureDraftHelpers";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import type { ResultDraftOp } from "@/hooks/liveRound/types";

describe("resultDraftHeatsSyncKeyFromHeats", () => {
  it("returns empty string for no heats", () => {
    expect(resultDraftHeatsSyncKeyFromHeats([])).toBe("");
    expect(resultDraftHeatsSyncKeyFromHeats(null)).toBe("");
    expect(resultDraftHeatsSyncKeyFromHeats(undefined)).toBe("");
  });

  it("includes only call-closed heats in sorted order", () => {
    const heats: HeatMarshalHeatRow[] = [
      { heatIndex: 3, callClosedAt: "2026-05-30T10:00:00.000Z", participants: [] },
      { heatIndex: 1, callClosedAt: null, participants: [] },
      { heatIndex: 2, callClosedAt: "2026-05-30T09:00:00.000Z", participants: [] },
    ];
    expect(resultDraftHeatsSyncKeyFromHeats(heats)).toBe("2,3");
  });
});

describe("resultDraftOpsForHeatFromServerRow", () => {
  it("returns ops when server is newer than local touch", () => {
    const ops = resultDraftOpsForHeatFromServerRow(
      1,
      {
        resultDraftPayload: {
          entries: {
            "I:e1": {
              opKey: "I:e1",
              heatIndex: 1,
              tieWithPrevious: false,
              inputOrder: "asc",
              participantType: "INDIVIDUAL",
              competitionEntryId: "e1",
            },
          },
        },
        updatedAt: "2026-05-31T12:00:00.000Z",
      },
      { lastLocalTouchMs: Date.parse("2026-05-31T11:00:00.000Z"), hasLocalForHeat: false }
    );
    expect(ops?.["I:e1"]?.opKey).toBe("I:e1");
  });

  it("returns null when server is older than local touch", () => {
    const ops = resultDraftOpsForHeatFromServerRow(
      1,
      {
        resultDraftPayload: { entries: {} },
        updatedAt: "2026-05-31T10:00:00.000Z",
      },
      { lastLocalTouchMs: Date.parse("2026-05-31T11:00:00.000Z"), hasLocalForHeat: false }
    );
    expect(ops).toBeNull();
  });
});

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

describe("draftsPendingAppendForHeat", () => {
  const eliminationDrafts: Record<string, ResultDraftOp> = {
    d1: {
      opKey: "I:e1",
      heatIndex: 1,
      tieWithPrevious: false,
      inputOrder: "desc",
      draftSequence: 1,
      participantType: "INDIVIDUAL",
      competitionEntryId: "e1",
    },
    d2: {
      opKey: "I:e2",
      heatIndex: 1,
      tieWithPrevious: false,
      inputOrder: "desc",
      draftSequence: 2,
      participantType: "INDIVIDUAL",
      competitionEntryId: "e2",
    },
    d3: {
      opKey: "I:e3",
      heatIndex: 1,
      tieWithPrevious: false,
      inputOrder: "desc",
      draftSequence: 3,
      participantType: "INDIVIDUAL",
      competitionEntryId: "e3",
    },
    d4: {
      opKey: "I:e4",
      heatIndex: 1,
      tieWithPrevious: false,
      inputOrder: "desc",
      draftSequence: 4,
      participantType: "INDIVIDUAL",
      competitionEntryId: "e4",
    },
    otherHeat: {
      opKey: "I:ex",
      heatIndex: 2,
      tieWithPrevious: false,
      inputOrder: "desc",
      draftSequence: 1,
      participantType: "INDIVIDUAL",
      competitionEntryId: "ex",
    },
  };

  it("returns all heat drafts sorted by draftSequence when no official rows", () => {
    const pending = draftsPendingAppendForHeat(eliminationDrafts, 1, []);
    expect(pending.map((op) => op.opKey)).toEqual(["I:e1", "I:e2", "I:e3", "I:e4"]);
  });

  it("excludes participants already in official rows", () => {
    const rows = [
      {
        heat: 1,
        lane: 1,
        rank: 8,
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: "e1",
        teamEntryId: null,
      },
      {
        heat: 1,
        lane: 2,
        rank: 7,
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: "e2",
        teamEntryId: null,
      },
    ];
    const pending = draftsPendingAppendForHeat(eliminationDrafts, 1, rows);
    expect(pending.map((op) => op.opKey)).toEqual(["I:e3", "I:e4"]);
  });

  it("returns empty for heat with no pending drafts", () => {
    expect(draftsPendingAppendForHeat(eliminationDrafts, 3, [])).toEqual([]);
  });
});
