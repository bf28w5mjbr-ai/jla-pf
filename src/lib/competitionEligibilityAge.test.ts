import { describe, expect, it } from "vitest";
import {
  calculateJapanCalendarAge,
  eligibilityFiscalYearLabelApril2Start,
  getCompetitionEligibilityAgeYears,
  getJapanCalendarDateParts,
} from "./competitionEligibilityAge";

describe("eligibilityFiscalYearLabelApril2Start", () => {
  it("4月2日以降はその暦年、4月1日とそれ以前は前年ラベル", () => {
    expect(eligibilityFiscalYearLabelApril2Start(new Date("2026-04-02T00:00:00+09:00"))).toBe(2026);
    expect(eligibilityFiscalYearLabelApril2Start(new Date("2026-04-01T23:59:00+09:00"))).toBe(2025);
    expect(eligibilityFiscalYearLabelApril2Start(new Date("2026-03-31T23:59:00+09:00"))).toBe(2025);
  });
});

describe("getCompetitionEligibilityAgeYears", () => {
  it("年度末日（翌年4/1）時点の満年齢", () => {
    const dob = new Date("2014-08-15T12:00:00+09:00");
    const start = new Date("2026-07-01T12:00:00+09:00");
    // FY2026 → 末日 2027-04-01 → 12歳
    expect(getCompetitionEligibilityAgeYears(dob, start)).toBe(12);
  });

  it("開催が年度前半でも開催日の属する年度で末日を取る", () => {
    const dob = new Date("2014-08-15T12:00:00+09:00");
    const start = new Date("2026-01-15T12:00:00+09:00");
    // FY2025 → 末日 2026-04-01 → 11歳
    expect(getCompetitionEligibilityAgeYears(dob, start)).toBe(11);
  });

  it("開催が4月1日のときは前年度扱い", () => {
    const dob = new Date("2014-08-15T12:00:00+09:00");
    const start = new Date("2026-04-01T12:00:00+09:00");
    expect(getCompetitionEligibilityAgeYears(dob, start)).toBe(11);
  });
});

describe("calculateJapanCalendarAge", () => {
  it("誕生日当日はその年齢に到達", () => {
    const birth = getJapanCalendarDateParts(new Date("2015-04-01T00:00:00+09:00"));
    expect(calculateJapanCalendarAge(birth, { year: 2027, month: 4, day: 1 })).toBe(12);
  });
});
