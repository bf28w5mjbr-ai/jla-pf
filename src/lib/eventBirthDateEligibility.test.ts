import { describe, expect, it } from "vitest";
import {
  calendarDateFromDbDate,
  eventUsesBirthDateRange,
  isUserDobInEventBirthDateRange,
  meetsEventAgeOrBirthRule,
} from "./eventBirthDateEligibility";

describe("isUserDobInEventBirthDateRange", () => {
  it("両端を含む（日本の生年月日）", () => {
    const from = new Date(Date.UTC(2008, 3, 2));
    const to = new Date(Date.UTC(2010, 2, 31));
    const dob = new Date("2009-06-15T12:00:00+09:00");
    expect(isUserDobInEventBirthDateRange(dob, from, to)).toBe(true);
  });

  it("境界の誕生日は含む", () => {
    const from = new Date(Date.UTC(2008, 3, 2));
    const to = new Date(Date.UTC(2010, 2, 31));
    expect(isUserDobInEventBirthDateRange(new Date("2008-04-02T00:00:00+09:00"), from, to)).toBe(true);
    expect(isUserDobInEventBirthDateRange(new Date("2010-03-31T00:00:00+09:00"), from, to)).toBe(true);
  });

  it("範囲外は不可", () => {
    const from = new Date(Date.UTC(2008, 3, 2));
    const to = new Date(Date.UTC(2010, 2, 31));
    expect(isUserDobInEventBirthDateRange(new Date("2008-04-01T12:00:00+09:00"), from, to)).toBe(false);
    expect(isUserDobInEventBirthDateRange(new Date("2010-04-01T12:00:00+09:00"), from, to)).toBe(false);
  });
});

describe("meetsEventAgeOrBirthRule", () => {
  it("生年月日範囲が優先される", () => {
    const dob = new Date("2009-01-01T12:00:00+09:00");
    expect(
      meetsEventAgeOrBirthRule({
        userDateOfBirth: dob,
        userEligibilityAgeYears: 5,
        event: {
          eligibleBirthDateFrom: new Date(Date.UTC(2008, 0, 1)),
          eligibleBirthDateTo: new Date(Date.UTC(2009, 11, 31)),
          minAge: 99,
          maxAge: 99,
        },
      })
    ).toBe(true);
  });

  it("範囲指定時に生年月日未登録は不可", () => {
    expect(
      meetsEventAgeOrBirthRule({
        userDateOfBirth: null,
        userEligibilityAgeYears: 12,
        event: {
          eligibleBirthDateFrom: new Date(Date.UTC(2008, 0, 1)),
          eligibleBirthDateTo: null,
        },
      })
    ).toBe(false);
  });

  it("範囲未設定時は従来の満年齢", () => {
    expect(
      meetsEventAgeOrBirthRule({
        userDateOfBirth: new Date("2010-01-01"),
        userEligibilityAgeYears: 12,
        event: { minAge: 10, maxAge: 15 },
      })
    ).toBe(true);
  });
});

describe("eventUsesBirthDateRange", () => {
  it("片方だけでも範囲モード", () => {
    expect(eventUsesBirthDateRange({ eligibleBirthDateFrom: new Date() })).toBe(true);
    expect(eventUsesBirthDateRange({ eligibleBirthDateTo: new Date() })).toBe(true);
    expect(eventUsesBirthDateRange({ minAge: 10 })).toBe(false);
  });
});

describe("calendarDateFromDbDate", () => {
  it("UTC 日付として読む", () => {
    expect(calendarDateFromDbDate(new Date(Date.UTC(2010, 2, 31)))).toEqual({
      year: 2010,
      month: 3,
      day: 31,
    });
  });
});
