import { describe, expect, it } from "vitest";

import {
  birthDateRangeForSeasonalAgeBand,
  buildAgeCategoryTemplateRows,
} from "@/lib/seasonalAgeToBirthDateRange";

const compStart = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("birthDateRangeForSeasonalAgeBand", () => {
  it("U-15 (age 0..15) 単独: from = (fy - 15, 4, 2), to = null", () => {
    const r = birthDateRangeForSeasonalAgeBand(compStart(2025, 6, 1), 0, 15);
    expect(r.eligibleBirthDateFrom?.toISOString().slice(0, 10)).toBe("2010-04-02");
    expect(r.eligibleBirthDateTo).toBeNull();
  });

  it("[16..18] のような中間帯: from と to の両方が埋まる", () => {
    const r = birthDateRangeForSeasonalAgeBand(compStart(2025, 6, 1), 16, 18);
    expect(r.eligibleBirthDateFrom?.toISOString().slice(0, 10)).toBe("2007-04-02");
    expect(r.eligibleBirthDateTo?.toISOString().slice(0, 10)).toBe("2010-04-01");
  });

  it("OPEN [19..∞]: from = null, to = (fy - 18, 4, 1)", () => {
    const r = birthDateRangeForSeasonalAgeBand(compStart(2025, 6, 1), 19, null);
    expect(r.eligibleBirthDateFrom).toBeNull();
    expect(r.eligibleBirthDateTo?.toISOString().slice(0, 10)).toBe("2007-04-01");
  });

  it("年度境界: 4/1 開催は前年度扱い、4/2 開催は当年度扱い", () => {
    const a = birthDateRangeForSeasonalAgeBand(compStart(2025, 4, 1), 0, 10);
    expect(a.eligibleBirthDateFrom?.toISOString().slice(0, 10)).toBe("2014-04-02");
    const b = birthDateRangeForSeasonalAgeBand(compStart(2025, 4, 2), 0, 10);
    expect(b.eligibleBirthDateFrom?.toISOString().slice(0, 10)).toBe("2015-04-02");
  });
});

describe("buildAgeCategoryTemplateRows", () => {
  it("複数 U + OPEN: 重ならない帯と OPEN 行を昇順で返す", () => {
    const rows = buildAgeCategoryTemplateRows(compStart(2025, 6, 1), [10, 15, 18], true);
    expect(rows.map((r) => r.name)).toEqual(["U-10", "U-15", "U-18", "OPEN"]);
    expect(rows[0]).toMatchObject({ kind: "UNDER", minAgeInclusive: 0, maxAgeInclusive: 10 });
    expect(rows[1]).toMatchObject({ kind: "UNDER", minAgeInclusive: 11, maxAgeInclusive: 15 });
    expect(rows[2]).toMatchObject({ kind: "UNDER", minAgeInclusive: 16, maxAgeInclusive: 18 });
    expect(rows[3]).toMatchObject({ kind: "OPEN", minAgeInclusive: 19, maxAgeInclusive: null });
  });

  it("OPEN 無し: OPEN 行は含まない", () => {
    const rows = buildAgeCategoryTemplateRows(compStart(2025, 6, 1), [12], false);
    expect(rows.map((r) => r.name)).toEqual(["U-12"]);
  });

  it("U 空 + OPEN: 単一の OPEN（無差別）を返す", () => {
    const rows = buildAgeCategoryTemplateRows(compStart(2025, 6, 1), [], true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "OPEN",
      kind: "OPEN",
      minAgeInclusive: 0,
      maxAgeInclusive: null,
      eligibleBirthDateFrom: null,
      eligibleBirthDateTo: null,
    });
  });

  it("U 空 + !OPEN: 空配列", () => {
    expect(buildAgeCategoryTemplateRows(compStart(2025, 6, 1), [], false)).toEqual([]);
  });
});
