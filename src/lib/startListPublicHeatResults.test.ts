import { describe, expect, it } from "vitest";
import { marshalIndividualKey } from "@/lib/dayOpsParticipantKeys";
import type { SnapshotParticipant } from "@/components/startListRoundList/types";
import {
  buildPublicHeatResultRoundOverlays,
  formatPublicHeatResultOverlayLabel,
  publicConfirmedResultSortTier,
  publicHeatResultOverlayKey,
  sortSnapshotParticipantEntriesForConfirmedOverlay,
  sortSnapshotParticipantsForConfirmedOverlay,
  type PublicHeatResultRoundOverlay,
} from "./startListPublicHeatResults";

const heat = 1;

function ind(entryId: string, name = entryId): SnapshotParticipant {
  return { kind: "INDIVIDUAL", name, entryId };
}

function overlayForHeat1(
  rows: Array<{
    entryId: string;
    rank: number | null;
    advanceWithoutRank?: boolean;
    status?: "OK" | "DSQ" | "DNS" | "DNF";
  }>
): PublicHeatResultRoundOverlay {
  const rowsByKey: PublicHeatResultRoundOverlay["rowsByKey"] = {};
  for (const row of rows) {
    const key = marshalIndividualKey(row.entryId);
    rowsByKey[publicHeatResultOverlayKey(heat, key)] = {
      rank: row.rank,
      status: row.status ?? "OK",
      advanceWithoutRank: row.advanceWithoutRank ?? false,
    };
  }
  return {
    round: "HEAT",
    isFinalized: false,
    confirmedHeatIndices: [heat],
    rowsByKey,
  };
}

function sortIndIds(
  participants: SnapshotParticipant[],
  overlay: PublicHeatResultRoundOverlay
): string[] {
  return sortSnapshotParticipantsForConfirmedOverlay(
    participants,
    heat,
    overlay,
    (p) => (p.kind === "INDIVIDUAL" && p.entryId ? marshalIndividualKey(p.entryId) : null)
  )
    .filter((p): p is SnapshotParticipant & { entryId: string } => p.kind === "INDIVIDUAL")
    .map((p) => p.entryId);
}

const competitionEndDate = new Date("2026-06-02T00:00:00.000Z");
const overlayOpts = { competitionEndDate };

describe("buildPublicHeatResultRoundOverlays", () => {
  it("確定ヒートのみ行が含まれる", () => {
    const overlays = buildPublicHeatResultRoundOverlays([
      {
        round: "HEAT",
        publishedAt: null,
        lockedAt: null,
        heatConfirmations: [{ heat: 1 }],
        rows: [
          {
            entryType: "INDIVIDUAL",
            competitionEntryId: "e1",
            teamEntryId: null,
            rank: 1,
            status: "OK",
            advanceWithoutRank: false,
            heat: 1,
          },
          {
            entryType: "INDIVIDUAL",
            competitionEntryId: "e2",
            teamEntryId: null,
            rank: 2,
            status: "OK",
            advanceWithoutRank: false,
            heat: 2,
          },
        ],
      },
    ], overlayOpts);

    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.confirmedHeatIndices).toEqual([1]);
    expect(Object.keys(overlays[0]?.rowsByKey ?? {})).toEqual(["1:I:e1"]);
    expect(overlays[0]?.rowsByKey["1:I:e1"]).toEqual({
      rank: 1,
      status: "OK",
      advanceWithoutRank: false,
    });
  });

  it("未確定ヒートの行は除外される", () => {
    const overlays = buildPublicHeatResultRoundOverlays([
      {
        round: "HEAT",
        publishedAt: null,
        lockedAt: null,
        heatConfirmations: [{ heat: 1 }],
        rows: [
          {
            entryType: "INDIVIDUAL",
            competitionEntryId: "e1",
            teamEntryId: null,
            rank: 1,
            status: "OK",
            advanceWithoutRank: false,
            heat: 1,
          },
          {
            entryType: "INDIVIDUAL",
            competitionEntryId: "e2",
            teamEntryId: null,
            rank: 1,
            status: "OK",
            advanceWithoutRank: false,
            heat: 2,
          },
        ],
      },
    ], overlayOpts);

    expect(Object.keys(overlays[0]?.rowsByKey ?? {})).not.toContain("2:I:e2");
  });

  it("isFinalized は lockedAt または大会終了日 23:59 JST 超過で true", () => {
    const provisional = buildPublicHeatResultRoundOverlays([
      {
        round: "HEAT",
        publishedAt: null,
        lockedAt: null,
        heatConfirmations: [{ heat: 1 }],
        rows: [],
      },
    ], { competitionEndDate, now: new Date("2026-06-01T12:00:00.000Z") });
    expect(provisional[0]?.isFinalized).toBe(false);

    const afterDeadline = buildPublicHeatResultRoundOverlays([
      {
        round: "FINAL",
        publishedAt: null,
        lockedAt: null,
        heatConfirmations: [{ heat: 1 }],
        rows: [],
      },
    ], { competitionEndDate, now: new Date("2026-06-03T00:00:00.000Z") });
    expect(afterDeadline[0]?.isFinalized).toBe(true);

    const publishedAtOnly = buildPublicHeatResultRoundOverlays([
      {
        round: "HEAT",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        lockedAt: null,
        heatConfirmations: [{ heat: 1 }],
        rows: [],
      },
    ], { competitionEndDate, now: new Date("2026-06-01T12:00:00.000Z") });
    expect(publishedAtOnly[0]?.isFinalized).toBe(false);

    const locked = buildPublicHeatResultRoundOverlays([
      {
        round: "FINAL",
        publishedAt: null,
        lockedAt: new Date("2026-01-02T00:00:00.000Z"),
        heatConfirmations: [{ heat: 1 }],
        rows: [],
      },
    ], { competitionEndDate, now: new Date("2026-06-01T12:00:00.000Z") });
    expect(locked[0]?.isFinalized).toBe(true);
  });

  it("ヒート確定がなければ overlay を返さない", () => {
    expect(
      buildPublicHeatResultRoundOverlays([
        {
          round: "HEAT",
          publishedAt: null,
          lockedAt: null,
          heatConfirmations: [],
          rows: [
            {
              entryType: "INDIVIDUAL",
              competitionEntryId: "e1",
              teamEntryId: null,
              rank: 1,
              status: "OK",
              advanceWithoutRank: false,
              heat: 1,
            },
          ],
        },
      ], overlayOpts)
    ).toEqual([]);
  });
});

describe("publicConfirmedResultSortTier", () => {
  it("進出・着順・ターミナルを判別する", () => {
    expect(
      publicConfirmedResultSortTier({
        rank: null,
        status: "OK",
        advanceWithoutRank: true,
      })
    ).toBe(0);
    expect(
      publicConfirmedResultSortTier({
        rank: 5,
        status: "OK",
        advanceWithoutRank: false,
      })
    ).toBe(1);
    expect(publicConfirmedResultSortTier(undefined)).toBe(3);
    expect(
      publicConfirmedResultSortTier({
        rank: null,
        status: "DSQ",
        advanceWithoutRank: false,
      })
    ).toBe(3);
    expect(
      publicConfirmedResultSortTier({
        rank: null,
        status: "DNF",
        advanceWithoutRank: false,
      })
    ).toBe(2);
  });
});

describe("sortSnapshotParticipantsForConfirmedOverlay", () => {
  it("着順のみ: rank 昇順のあとターミナル", () => {
    const overlay = overlayForHeat1([
      { entryId: "e2", rank: 2 },
      { entryId: "e1", rank: 1 },
    ]);
    const participants = [ind("dns"), ind("e2"), ind("e1")];
    expect(sortIndIds(participants, overlay)).toEqual(["e1", "e2", "dns"]);
  });

  it("進出→着順→ターミナルの順（進出はスナップショット元インデックス昇順）", () => {
    const overlay = overlayForHeat1([
      { entryId: "ru2", rank: null, advanceWithoutRank: true },
      { entryId: "ru1", rank: null, advanceWithoutRank: true },
      { entryId: "e5", rank: 5 },
      { entryId: "e6", rank: 6 },
      { entryId: "dsq", rank: null, status: "DSQ" },
    ]);
    // スナップショット配列はスタートレーン順（ru1 が ru2 より前）を想定
    const participants = [ind("dsq"), ind("e6"), ind("ru1"), ind("e5"), ind("ru2")];
    expect(sortIndIds(participants, overlay)).toEqual(["ru1", "ru2", "e5", "e6", "dsq"]);
  });

  it("同着 rank は参加者キー順", () => {
    const overlay = overlayForHeat1([
      { entryId: "b", rank: 2 },
      { entryId: "a", rank: 2 },
    ]);
    expect(sortIndIds([ind("b"), ind("a")], overlay)).toEqual(["a", "b"]);
  });

  it("棄権フィルタ後も元インデックスで進出を並べる", () => {
    const overlay = overlayForHeat1([
      { entryId: "ru2", rank: null, advanceWithoutRank: true },
      { entryId: "ru1", rank: null, advanceWithoutRank: true },
    ]);
    const entries = [
      { participant: ind("ru2"), snapshotIndex: 3 },
      { participant: ind("ru1"), snapshotIndex: 1 },
    ];
    const sorted = sortSnapshotParticipantEntriesForConfirmedOverlay(
      entries,
      heat,
      overlay,
      (p) =>
        p.kind === "INDIVIDUAL" && p.entryId ? marshalIndividualKey(p.entryId) : null
    );
    expect(
      sorted.map((p) => (p.kind === "INDIVIDUAL" ? p.entryId : null))
    ).toEqual(["ru1", "ru2"]);
  });
});

describe("formatPublicHeatResultOverlayLabel", () => {
  it("順位・ステータス・進出を整形する", () => {
    expect(
      formatPublicHeatResultOverlayLabel({
        rank: 3,
        status: "OK",
        advanceWithoutRank: false,
      })
    ).toBe("3位");
    expect(
      formatPublicHeatResultOverlayLabel({
        rank: null,
        status: "DNS",
        advanceWithoutRank: false,
      })
    ).toBe("DNS");
    expect(
      formatPublicHeatResultOverlayLabel({
        rank: null,
        status: "OK",
        advanceWithoutRank: true,
      })
    ).toBe("進出");
  });
});
