import { describe, expect, it } from "vitest";
import { getCompetitionEligibilityAgeYears } from "./competitionEligibilityAge";
import {
  ageFitsUnderPartition,
  computeSeasonalUnderAgeYears,
  inferUnderCycleBoundsFromCompetitionStart,
  partitionUnderAgeBands,
  resolveUnderTierKeyForSeasonalAge,
} from "./competitionUnderAgeSystem";

describe("partitionUnderAgeBands", () => {
  it("U-10 と U-15 のみ・OPEN オフ: 11〜15 と 10 以下のみ有効、16 以上は不可（仕様 A）", () => {
    const p = partitionUnderAgeBands([15, 10], false);
    expect(p.openBand).toBeNull();
    expect(ageFitsUnderPartition(8, p)).toBe(true);
    expect(ageFitsUnderPartition(10, p)).toBe(true);
    expect(ageFitsUnderPartition(11, p)).toBe(true);
    expect(ageFitsUnderPartition(15, p)).toBe(true);
    expect(ageFitsUnderPartition(16, p)).toBe(false);
  });

  it("U-10 と U-15・OPEN オン: 16 以上は OPEN", () => {
    const p = partitionUnderAgeBands([15, 10], true);
    expect(p.openBand).toEqual({ kind: "OPEN", minAgeInclusive: 16 });
    expect(ageFitsUnderPartition(16, p)).toBe(true);
  });

  it("OPEN のみ: 無差別", () => {
    const p = partitionUnderAgeBands([], true);
    expect(ageFitsUnderPartition(0, p)).toBe(true);
    expect(ageFitsUnderPartition(99, p)).toBe(true);
  });

  it("U のみ・OPEN オフ: 最大 U より上は不可", () => {
    const p = partitionUnderAgeBands([18], false);
    expect(ageFitsUnderPartition(18, p)).toBe(true);
    expect(ageFitsUnderPartition(19, p)).toBe(false);
  });
});

describe("inferUnderCycleBoundsFromCompetitionStart", () => {
  it("5月開催はその年の 4/2 から翌 4/1", () => {
    const s = new Date(Date.UTC(2026, 4, 15));
    const b = inferUnderCycleBoundsFromCompetitionStart(s);
    expect(b.cycleStart.toISOString().slice(0, 10)).toBe("2026-04-02");
    expect(b.cycleEndInclusive.toISOString().slice(0, 10)).toBe("2027-04-01");
  });
});

describe("computeSeasonalUnderAgeYears", () => {
  it("competitionEligibilityAge と一致する（年度末4/1・日本暦）", () => {
    const dob = new Date(Date.UTC(2008, 4, 1));
    const start = new Date(Date.UTC(2026, 7, 15));
    expect(computeSeasonalUnderAgeYears(dob, start)).toBe(
      getCompetitionEligibilityAgeYears(dob, start)
    );
  });
});

describe("resolveUnderTierKeyForSeasonalAge", () => {
  it("U-10 / U-15 / OPEN で正しいキーを返す", () => {
    const p = partitionUnderAgeBands([15, 10], true);
    expect(resolveUnderTierKeyForSeasonalAge(9, p)).toBe("U-10");
    expect(resolveUnderTierKeyForSeasonalAge(12, p)).toBe("U-15");
    expect(resolveUnderTierKeyForSeasonalAge(20, p)).toBe("OPEN");
    expect(resolveUnderTierKeyForSeasonalAge(16, partitionUnderAgeBands([15, 10], false))).toBeNull();
  });
});
