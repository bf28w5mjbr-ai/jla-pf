import { describe, expect, it } from "vitest";
import {
  computeNonTieNextHeatResultRank,
  computeProvisionalDraftRanks,
  statsFromHeatOkRows,
} from "@/lib/heatResultCaptureNextRank";

describe("computeNonTieNextHeatResultRank", () => {
  it("desc: 初回は召集人数", () => {
    expect(
      computeNonTieNextHeatResultRank({
        inputOrder: "desc",
        descCalledBaseline: 8,
        stats: { okRowCount: 0, maxRank: 0, minRank: null },
      })
    ).toBe(8);
  });

  it("desc: 既存行ありは minRank - 1", () => {
    expect(
      computeNonTieNextHeatResultRank({
        inputOrder: "desc",
        descCalledBaseline: 8,
        stats: { okRowCount: 1, maxRank: 8, minRank: 8 },
      })
    ).toBe(7);
  });

  it("desc: 同着2人のあとも minRank - 1（rank が飛ばない）", () => {
    expect(
      computeNonTieNextHeatResultRank({
        inputOrder: "desc",
        descCalledBaseline: 8,
        stats: { okRowCount: 2, maxRank: 8, minRank: 8 },
      })
    ).toBe(7);
  });

  it("asc: maxRank + 1", () => {
    expect(
      computeNonTieNextHeatResultRank({
        inputOrder: "asc",
        descCalledBaseline: null,
        stats: { okRowCount: 2, maxRank: 2, minRank: 1 },
      })
    ).toBe(3);
  });
});

describe("statsFromHeatOkRows", () => {
  it("min/max/count を集計する", () => {
    expect(statsFromHeatOkRows([{ rank: 8 }, { rank: 7 }, { rank: null }])).toEqual({
      okRowCount: 2,
      maxRank: 8,
      minRank: 7,
    });
  });
});

describe("computeProvisionalDraftRanks", () => {
  it("desc: 下書きのみ 8→7→同着7", () => {
    const ranks = computeProvisionalDraftRanks({
      serverRanks: [],
      drafts: [
        { key: "a", seq: 1, tieWithPrevious: false },
        { key: "b", seq: 2, tieWithPrevious: false },
        { key: "c", seq: 3, tieWithPrevious: true },
      ],
      inputOrder: "desc",
      calledN: 8,
    });
    expect(ranks.get("a")).toBe(8);
    expect(ranks.get("b")).toBe(7);
    expect(ranks.get("c")).toBe(7);
  });

  it("desc: 8同着2人の次は7", () => {
    const ranks = computeProvisionalDraftRanks({
      serverRanks: [],
      drafts: [
        { key: "a", seq: 1, tieWithPrevious: false },
        { key: "b", seq: 2, tieWithPrevious: true },
        { key: "c", seq: 3, tieWithPrevious: false },
      ],
      inputOrder: "desc",
      calledN: 8,
    });
    expect(ranks.get("a")).toBe(8);
    expect(ranks.get("b")).toBe(8);
    expect(ranks.get("c")).toBe(7);
  });

  it("asc: 同着は直前 draft と同 rank", () => {
    const ranks = computeProvisionalDraftRanks({
      serverRanks: [],
      drafts: [
        { key: "a", seq: 1, tieWithPrevious: false },
        { key: "b", seq: 2, tieWithPrevious: true },
        { key: "c", seq: 3, tieWithPrevious: false },
      ],
      inputOrder: "asc",
      calledN: 8,
    });
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("c")).toBe(2);
  });

  it("desc: 公式8着のあと下書き同着", () => {
    const ranks = computeProvisionalDraftRanks({
      serverRanks: [8],
      drafts: [{ key: "b", seq: 1, tieWithPrevious: true }],
      inputOrder: "desc",
      calledN: 8,
    });
    expect(ranks.get("b")).toBe(8);
  });
});
