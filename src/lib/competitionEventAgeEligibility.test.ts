import { describe, expect, it } from "vitest";
import { buildAgeCategoryTemplateRows } from "@/lib/seasonalAgeToBirthDateRange";
import {
  meetsCompetitionEventAgeEligibility,
  resolveAllowedAgeCategoryIds,
  validateAllowedAgeCategoryIdsAgainstCompetition,
} from "./competitionEventAgeEligibility";

const compStart = new Date(Date.UTC(2025, 5, 1));

function templateCategories() {
  const rows = buildAgeCategoryTemplateRows(compStart, [15, 18], true);
  const u15 = rows.find((r) => r.name === "U-15")!;
  const u18 = rows.find((r) => r.name === "U-18")!;
  const open = rows.find((r) => r.name === "OPEN")!;
  return {
    u15: {
      id: "cat-u15",
      displayOrder: 1,
      eligibleBirthDateFrom: u15.eligibleBirthDateFrom,
      eligibleBirthDateTo: u15.eligibleBirthDateTo,
    },
    u18: {
      id: "cat-u18",
      displayOrder: 2,
      eligibleBirthDateFrom: u18.eligibleBirthDateFrom,
      eligibleBirthDateTo: u18.eligibleBirthDateTo,
    },
    open: {
      id: "cat-open",
      displayOrder: 3,
      eligibleBirthDateFrom: open.eligibleBirthDateFrom,
      eligibleBirthDateTo: open.eligibleBirthDateTo,
    },
    all: [] as Array<{
      id: string;
      displayOrder: number;
      eligibleBirthDateFrom: Date | null;
      eligibleBirthDateTo: Date | null;
    }>,
  };
}

describe("resolveAllowedAgeCategoryIds", () => {
  it("明示リストがあればそれを返す", () => {
    expect(
      resolveAllowedAgeCategoryIds({
        ageCategoryId: "cat-u18",
        allowedAgeCategoryIds: ["cat-u15", "cat-u18"],
      })
    ).toEqual(["cat-u15", "cat-u18"]);
  });

  it("明示リストが空なら ageCategoryId にフォールバック", () => {
    expect(
      resolveAllowedAgeCategoryIds({
        ageCategoryId: "cat-u18",
        allowedAgeCategoryIds: null,
      })
    ).toEqual(["cat-u18"]);
  });
});

describe("validateAllowedAgeCategoryIdsAgainstCompetition", () => {
  it("大会に存在しない ID は拒否", () => {
    const r = validateAllowedAgeCategoryIdsAgainstCompetition(
      ["cat-u15", "unknown"],
      new Set(["cat-u15", "cat-u18"])
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("不明な年齢カテゴリ");
    }
  });
});

describe("meetsCompetitionEventAgeEligibility", () => {
  const cats = templateCategories();
  cats.all = [cats.u15, cats.u18, cats.open];

  const u15Dob = new Date(Date.UTC(2012, 5, 15));
  const u18Dob = new Date(Date.UTC(2009, 5, 15));
  const openDob = new Date(Date.UTC(2000, 5, 15));

  it("U-15 選手 + allowed=[U-15,U-18] → OK", () => {
    expect(
      meetsCompetitionEventAgeEligibility({
        event: {
          ageCategoryId: "cat-u18",
          allowedAgeCategoryIds: ["cat-u15", "cat-u18"],
        },
        userDateOfBirth: u15Dob,
        seasonalAgeYears: 12,
        competitionAgeCategories: cats.all,
      })
    ).toBe(true);
  });

  it("U-15 選手 + allowed=[U-18] のみ → NG", () => {
    expect(
      meetsCompetitionEventAgeEligibility({
        event: {
          ageCategoryId: "cat-u18",
          allowedAgeCategoryIds: ["cat-u18"],
        },
        userDateOfBirth: u15Dob,
        seasonalAgeYears: 12,
        competitionAgeCategories: cats.all,
      })
    ).toBe(false);
  });

  it("allowed 未設定 + ageCategoryId=U-18 → U-18 のみ可", () => {
    expect(
      meetsCompetitionEventAgeEligibility({
        event: {
          ageCategoryId: "cat-u18",
          allowedAgeCategoryIds: null,
        },
        userDateOfBirth: u18Dob,
        seasonalAgeYears: 16,
        competitionAgeCategories: cats.all,
      })
    ).toBe(true);

    expect(
      meetsCompetitionEventAgeEligibility({
        event: {
          ageCategoryId: "cat-u18",
          allowedAgeCategoryIds: null,
        },
        userDateOfBirth: u15Dob,
        seasonalAgeYears: 12,
        competitionAgeCategories: cats.all,
      })
    ).toBe(false);
  });

  it("OPEN のみの選手は U-15+U-18 許可種目には不可", () => {
    expect(
      meetsCompetitionEventAgeEligibility({
        event: {
          ageCategoryId: "cat-u18",
          allowedAgeCategoryIds: ["cat-u15", "cat-u18"],
        },
        userDateOfBirth: openDob,
        seasonalAgeYears: 25,
        competitionAgeCategories: cats.all,
      })
    ).toBe(false);
  });
});
