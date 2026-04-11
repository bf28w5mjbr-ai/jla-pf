import { describe, expect, it } from "vitest";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import {
  dedupeOfficialResultRowsForAdvance,
  groupOfficialRowsByResolvedHeatAndSnapshotOrder,
  isOfficialRowEligibleForNextRoundAdvance,
  resolveOfficialRowHeatBucketKey,
} from "./startListAdvanceEligibility";

function minimalSnapshot(eventId: string, entryId: string, heatIndex: number): StartListSnapshotPayload {
  return {
    version: 1,
    capturedAt: "2020-01-01T00:00:00.000Z",
    events: [
      {
        eventId,
        name: "Test",
        sex: "MALE",
        type: "INDIVIDUAL",
        rounds: [
          {
            round: "HEAT",
            generatedAt: "2020-01-01T00:00:00.000Z",
            generatedBy: "ENTRY_CLOSE",
            heats: [
              {
                heatIndex,
                participants: [
                  {
                    kind: "INDIVIDUAL" as const,
                    entryId,
                    userId: "u1",
                    name: "T T",
                    clubId: null,
                    clubName: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function snapshotWithHeats(
  eventId: string,
  heats: { heatIndex: number; entryIds: string[] }[]
): StartListSnapshotPayload {
  return {
    version: 1,
    capturedAt: "2020-01-01T00:00:00.000Z",
    events: [
      {
        eventId,
        name: "Test",
        sex: "MALE",
        type: "INDIVIDUAL",
        rounds: [
          {
            round: "HEAT",
            generatedAt: "2020-01-01T00:00:00.000Z",
            generatedBy: "ENTRY_CLOSE",
            heats: heats.map(({ heatIndex, entryIds }) => ({
              heatIndex,
              participants: entryIds.map((entryId) => ({
                kind: "INDIVIDUAL" as const,
                entryId,
                userId: "u",
                name: "N N",
                clubId: null,
                clubName: null,
              })),
            })),
          },
        ],
      },
    ],
  };
}

describe("groupOfficialRowsByResolvedHeatAndSnapshotOrder", () => {
  const eventId = "ev-mh";

  it("heat が null でもスナップショット上のヒートに振り分け、heatIndex 順で全ヒート行を返す", () => {
    const snap = snapshotWithHeats(eventId, [
      { heatIndex: 1, entryIds: ["e1"] },
      { heatIndex: 2, entryIds: ["e2"] },
      { heatIndex: 3, entryIds: ["e3"] },
      { heatIndex: 4, entryIds: ["e4", "e5"] },
    ]);
    const rows = [
      {
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: "e1",
        teamEntryId: null,
        heat: null,
      },
      {
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: "e2",
        teamEntryId: null,
        heat: null,
      },
      {
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: "e3",
        teamEntryId: null,
        heat: null,
      },
      {
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: "e4",
        teamEntryId: null,
        heat: null,
      },
      {
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: "e5",
        teamEntryId: null,
        heat: null,
      },
    ];
    const out = groupOfficialRowsByResolvedHeatAndSnapshotOrder(rows, snap, eventId, "HEAT");
    expect(out.map(([k]) => k)).toEqual([1, 2, 3, 4]);
    expect(out[0][1].map((r) => r.competitionEntryId)).toEqual(["e1"]);
    expect(out[3][1].map((r) => r.competitionEntryId).sort()).toEqual(["e4", "e5"]);
  });

  it("マーシャルでヒートが解決できるときは公式 heat よりスナップショットを優先する", () => {
    const snap = snapshotWithHeats(eventId, [{ heatIndex: 1, entryIds: ["e1"] }]);
    const key = resolveOfficialRowHeatBucketKey(
      {
        entryType: "INDIVIDUAL",
        competitionEntryId: "e1",
        teamEntryId: null,
        heat: 9,
      },
      snap,
      eventId,
      "HEAT"
    );
    expect(key).toBe(1);
  });

  it("スナップに未登録なら公式 heat にフォールバックする", () => {
    const snap = snapshotWithHeats(eventId, [{ heatIndex: 1, entryIds: ["e2"] }]);
    const key = resolveOfficialRowHeatBucketKey(
      {
        entryType: "INDIVIDUAL",
        competitionEntryId: "e1",
        teamEntryId: null,
        heat: 9,
      },
      snap,
      eventId,
      "HEAT"
    );
    expect(key).toBe(9);
  });
});

describe("isOfficialRowEligibleForNextRoundAdvance", () => {
  const eventId = "ev1";
  const snapshot = minimalSnapshot(eventId, "en1", 1);

  it("CALLED かつヒート一致なら進出候補", () => {
    const latest = new Map([["I:en1", "CALLED"]]);
    expect(
      isOfficialRowEligibleForNextRoundAdvance(
        {
          entryType: "INDIVIDUAL",
          competitionEntryId: "en1",
          teamEntryId: null,
          heat: 1,
        },
        1,
        "HEAT",
        eventId,
        snapshot,
        latest
      )
    ).toBe(true);
  });

  it("未召集は進出しない", () => {
    const latest = new Map([["I:en1", "PENDING"]]);
    expect(
      isOfficialRowEligibleForNextRoundAdvance(
        {
          entryType: "INDIVIDUAL",
          competitionEntryId: "en1",
          teamEntryId: null,
          heat: 1,
        },
        1,
        "HEAT",
        eventId,
        snapshot,
        latest
      )
    ).toBe(false);
  });

  it("DSQ は進出しない", () => {
    const latest = new Map([["I:en1", "DSQ"]]);
    expect(
      isOfficialRowEligibleForNextRoundAdvance(
        {
          entryType: "INDIVIDUAL",
          competitionEntryId: "en1",
          teamEntryId: null,
          heat: 1,
        },
        1,
        "HEAT",
        eventId,
        snapshot,
        latest
      )
    ).toBe(false);
  });

  it("別ヒートの公式行は進出しない", () => {
    const latest = new Map([["I:en1", "CALLED"]]);
    expect(
      isOfficialRowEligibleForNextRoundAdvance(
        {
          entryType: "INDIVIDUAL",
          competitionEntryId: "en1",
          teamEntryId: null,
          heat: 2,
        },
        2,
        "HEAT",
        eventId,
        snapshot,
        latest
      )
    ).toBe(false);
  });
});

describe("dedupeOfficialResultRowsForAdvance", () => {
  it("同一 entry の重複行を 1 行にし、より良い着順を残す", () => {
    const rows = [
      {
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: "a",
        teamEntryId: null,
        rank: 3,
        heat: 1,
      },
      {
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: "a",
        teamEntryId: null,
        rank: 1,
        heat: 2,
      },
    ];
    const out = dedupeOfficialResultRowsForAdvance(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.rank).toBe(1);
    expect(out[0]!.heat).toBe(2);
  });

  it("同着なら heat 番号が小さい行を残す", () => {
    const rows = [
      {
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: "a",
        teamEntryId: null,
        rank: 1,
        heat: 2,
      },
      {
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: "a",
        teamEntryId: null,
        rank: 1,
        heat: 1,
      },
    ];
    const out = dedupeOfficialResultRowsForAdvance(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.heat).toBe(1);
  });

  it("チームは teamEntryId で重複排除", () => {
    const rows = [
      {
        entryType: "TEAM" as const,
        competitionEntryId: null,
        teamEntryId: "t1",
        rank: 2,
        heat: 1,
      },
      {
        entryType: "TEAM" as const,
        competitionEntryId: null,
        teamEntryId: "t1",
        rank: 1,
        heat: 1,
      },
    ];
    expect(dedupeOfficialResultRowsForAdvance(rows)).toHaveLength(1);
  });
});
