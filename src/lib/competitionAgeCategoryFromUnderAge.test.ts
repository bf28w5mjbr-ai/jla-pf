import { describe, expect, it } from "vitest";
import { normalizeUnderAgeThresholds } from "./competitionAgeCategoryFromUnderAge";

describe("normalizeUnderAgeThresholds", () => {
  it("deduplicates, sorts ascending, and filters invalid values", () => {
    expect(normalizeUnderAgeThresholds([15, "10", 15, "x", -1, 151, 12.9])).toEqual([
      10, 12, 15,
    ]);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeUnderAgeThresholds(null)).toEqual([]);
    expect(normalizeUnderAgeThresholds("15")).toEqual([]);
  });

  it("accepts empty thresholds for OPEN-only generation", () => {
    expect(normalizeUnderAgeThresholds([])).toEqual([]);
  });
});
