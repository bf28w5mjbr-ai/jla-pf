import { describe, expect, it } from "vitest";
import {
  parseEventCreateTeamFields,
  resolveEventCreateEligibility,
} from "./competitionEventCreateFields";

describe("resolveEventCreateEligibility", () => {
  const validIds = new Set(["cat-u15", "cat-u18"]);

  it("タブあり + allowedAgeCategoryIds 指定", () => {
    const r = resolveEventCreateEligibility({
      body: { allowedAgeCategoryIds: ["cat-u15", "cat-u18"] },
      targetAgeCategoryId: "cat-u18",
      validCategoryIds: validIds,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.allowedAgeCategoryIds).toEqual(["cat-u15", "cat-u18"]);
      expect(r.data.ageCategoryId).toBe("cat-u18");
    }
  });

  it("タブあり + 未指定は [ageCategoryId]", () => {
    const r = resolveEventCreateEligibility({
      body: {},
      targetAgeCategoryId: "cat-u18",
      validCategoryIds: validIds,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.allowedAgeCategoryIds).toEqual(["cat-u18"]);
    }
  });

  it("未分類 + 生年月日", () => {
    const r = resolveEventCreateEligibility({
      body: {
        eligibleBirthDateFrom: "2010-04-02",
        eligibleBirthDateTo: "2015-04-01",
      },
      targetAgeCategoryId: null,
      validCategoryIds: validIds,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.eligibleBirthDateFrom?.toISOString().slice(0, 10)).toBe("2010-04-02");
      expect(r.data.ageCategoryId).toBeNull();
    }
  });
});

describe("parseEventCreateTeamFields", () => {
  it("チーム種目でポジションを設定", () => {
    const r = parseEventCreateTeamFields(
      {
        teamRelayPositionCount: 2,
        teamRelayPositionNames: ["1st", "2nd"],
      },
      "TEAM"
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.teamRelayPositionCount).toBe(2);
      expect(r.data.teamRelayPositionNames).toEqual(["1st", "2nd"]);
    }
  });

  it("個人種目ではチーム設定不可", () => {
    const r = parseEventCreateTeamFields({ teamRelayPositionCount: 4 }, "INDIVIDUAL");
    expect(r.ok).toBe(false);
  });
});
