import { describe, expect, it } from "vitest";
import {
  buildPublicHeatResultRoundOverlays,
  formatPublicHeatResultOverlayLabel,
} from "./startListPublicHeatResults";

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
    ]);

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
    ]);

    expect(Object.keys(overlays[0]?.rowsByKey ?? {})).not.toContain("2:I:e2");
  });

  it("isFinalized が publishedAt / lockedAt で切り替わる", () => {
    const provisional = buildPublicHeatResultRoundOverlays([
      {
        round: "HEAT",
        publishedAt: null,
        lockedAt: null,
        heatConfirmations: [{ heat: 1 }],
        rows: [],
      },
    ]);
    expect(provisional[0]?.isFinalized).toBe(false);

    const published = buildPublicHeatResultRoundOverlays([
      {
        round: "HEAT",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        lockedAt: null,
        heatConfirmations: [{ heat: 1 }],
        rows: [],
      },
    ]);
    expect(published[0]?.isFinalized).toBe(true);

    const locked = buildPublicHeatResultRoundOverlays([
      {
        round: "FINAL",
        publishedAt: null,
        lockedAt: new Date("2026-01-02T00:00:00.000Z"),
        heatConfirmations: [{ heat: 1 }],
        rows: [],
      },
    ]);
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
      ])
    ).toEqual([]);
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
