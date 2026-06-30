import { describe, expect, it } from "vitest";
import {
  formatEventEligibilitySubtitle,
  formatEventListRowLabel,
} from "./competitionEventListLabel";

describe("formatEventEligibilitySubtitle", () => {
  it("カテゴリ許可リストをカンマ区切りで表示", () => {
    expect(
      formatEventEligibilitySubtitle({
        event: {
          ageCategoryId: "cat-u18",
          allowedAgeCategoryIds: ["cat-u15", "cat-u18"],
        },
        ageCategories: [
          { id: "cat-u15", name: "U-15" },
          { id: "cat-u18", name: "U-18" },
        ],
        useCategoryAllowList: true,
      })
    ).toBe("U-15, U-18");
  });

  it("未分類は生年月日または制限なし", () => {
    expect(
      formatEventEligibilitySubtitle({
        event: { eligibleBirthDateFrom: null, eligibleBirthDateTo: null },
        ageCategories: [],
        useCategoryAllowList: false,
      })
    ).toBe("制限なし");

    expect(
      formatEventEligibilitySubtitle({
        event: {
          eligibleBirthDateFrom: new Date(Date.UTC(2010, 3, 2)),
          eligibleBirthDateTo: new Date(Date.UTC(2015, 3, 1)),
        },
        ageCategories: [],
        useCategoryAllowList: false,
      })
    ).toBe("2010-04-02 〜 2015-04-01");
  });
});

describe("formatEventListRowLabel", () => {
  it("種目名・性別・参加条件を結合", () => {
    expect(
      formatEventListRowLabel({
        storedEventName: "U-18ボードレース",
        ageCategoryName: "U-18",
        sexOption: "BOTH",
        eligibilitySubtitle: "U-15, U-18",
      })
    ).toBe("ボードレース · 男女 · U-15, U-18");
  });
});
