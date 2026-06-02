import { describe, expect, it } from "vitest";
import { computeCompactOkRanks, type OkRankRowForCompact } from "@/lib/heatResultRankCompact";

function ranksById(rows: OkRankRowForCompact[]): Map<string, number> {
  return computeCompactOkRanks(rows);
}

describe("computeCompactOkRanks", () => {
  it("fills gap when middle rank is removed (conceptually)", () => {
    const result = ranksById([
      { id: "a", rank: 1, tieGroup: null },
      { id: "c", rank: 3, tieGroup: null },
    ]);
    expect(result.get("a")).toBe(1);
    expect(result.get("c")).toBe(2);
  });

  it("preserves tie group and compacts trailing rank", () => {
    const tg = "tie-1";
    const result = ranksById([
      { id: "a", rank: 1, tieGroup: tg },
      { id: "b", rank: 1, tieGroup: tg },
      { id: "c", rank: 3, tieGroup: null },
    ]);
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(1);
    expect(result.get("c")).toBe(2);
  });

  it("groups same rank without tieGroup as one level", () => {
    const result = ranksById([
      { id: "a", rank: 1, tieGroup: null },
      { id: "b", rank: 1, tieGroup: null },
      { id: "c", rank: 3, tieGroup: null },
    ]);
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(1);
    expect(result.get("c")).toBe(2);
  });

  it("is no-op when already contiguous", () => {
    const rows: OkRankRowForCompact[] = [
      { id: "a", rank: 1, tieGroup: null },
      { id: "b", rank: 2, tieGroup: null },
    ];
    const result = ranksById(rows);
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(2);
  });

  it("returns empty map for no rows", () => {
    expect(ranksById([]).size).toBe(0);
  });
});
