import { describe, expect, it } from "vitest";
import { buildHostOrganizationSnapshot } from "./createDraftCompetition";

describe("buildHostOrganizationSnapshot", () => {
  it("copies organization display fields", () => {
    expect(
      buildHostOrganizationSnapshot({
        name: "テスト主催",
        nameKana: "テストシュサイ",
        abbreviation: "TS",
      })
    ).toEqual({
      hostOrganizationName: "テスト主催",
      hostOrganizationNameKana: "テストシュサイ",
      hostOrganizationAbbreviation: "TS",
    });
  });

  it("preserves null kana and abbreviation", () => {
    expect(
      buildHostOrganizationSnapshot({
        name: "主催のみ",
        nameKana: null,
        abbreviation: null,
      })
    ).toEqual({
      hostOrganizationName: "主催のみ",
      hostOrganizationNameKana: null,
      hostOrganizationAbbreviation: null,
    });
  });
});
