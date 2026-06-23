import { describe, expect, it } from "vitest";

import {
  KANAGAWA28_COMPETITION_ID,
  resolveAgeCategoriesForEntrySummaryCount,
} from "./competitionEntrySummaryAgeCategoryOverrides";
import { pickAgeCategoryIdForBirthDate } from "./competitionEntryAgeTiered";

const baseCategories = [
  {
    id: "open",
    name: "オープン",
    displayOrder: 0,
    eligibleBirthDateFrom: new Date(Date.UTC(1900, 3, 2)),
    eligibleBirthDateTo: new Date(Date.UTC(2011, 3, 1)),
  },
  {
    id: "u18",
    name: "U-18",
    displayOrder: 1,
    eligibleBirthDateFrom: new Date(Date.UTC(2005, 3, 2)),
    eligibleBirthDateTo: new Date(Date.UTC(2014, 3, 1)),
  },
  {
    id: "u15",
    name: "U-15",
    displayOrder: 2,
    eligibleBirthDateFrom: new Date(Date.UTC(2011, 3, 2)),
    eligibleBirthDateTo: new Date(Date.UTC(2014, 3, 1)),
  },
];

describe("resolveAgeCategoriesForEntrySummaryCount", () => {
  it("神奈川28以外は変更しない", () => {
    expect(resolveAgeCategoriesForEntrySummaryCount("other", baseCategories)).toEqual(baseCategories);
  });

  it("神奈川28は OPEN/U-18 のレンジを補正し U-15 が先に取られない", () => {
    const resolved = resolveAgeCategoriesForEntrySummaryCount(
      KANAGAWA28_COMPETITION_ID,
      baseCategories
    );
    const u15Dob = new Date(Date.UTC(2012, 5, 15));
    expect(pickAgeCategoryIdForBirthDate(resolved, u15Dob)).toBe("u15");

    const u18Dob = new Date(Date.UTC(2008, 5, 15));
    expect(pickAgeCategoryIdForBirthDate(resolved, u18Dob)).toBe("u18");

    const openDob = new Date(Date.UTC(2000, 5, 15));
    expect(pickAgeCategoryIdForBirthDate(resolved, openDob)).toBe("open");
  });
});
