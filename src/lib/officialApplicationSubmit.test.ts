import { describe, expect, it } from "vitest";
import {
  isTechnicalOfficialPositionName,
  shouldBlockDisabledTechnicalOfficialDowngrade,
} from "@/lib/officialApplicationSubmit";

describe("isTechnicalOfficialPositionName", () => {
  it("detects TO applications by stored position name", () => {
    expect(isTechnicalOfficialPositionName("テクニカルオフィシャル（東京LSC）")).toBe(true);
    expect(isTechnicalOfficialPositionName("オフィシャル")).toBe(false);
    expect(isTechnicalOfficialPositionName(null)).toBe(false);
  });
});

describe("shouldBlockDisabledTechnicalOfficialDowngrade", () => {
  it("blocks implicit TO to GENERAL downgrade while TO recruitment is disabled", () => {
    expect(
      shouldBlockDisabledTechnicalOfficialDowngrade({
        existingPositionName: "テクニカルオフィシャル（東京LSC）",
        nextEntryType: "GENERAL",
        technicalOfficialRecruitmentEnabled: false,
      })
    ).toBe(true);
  });

  it("allows explicit GENERAL updates when the existing application is not TO", () => {
    expect(
      shouldBlockDisabledTechnicalOfficialDowngrade({
        existingPositionName: "オフィシャル",
        nextEntryType: "GENERAL",
        technicalOfficialRecruitmentEnabled: false,
      })
    ).toBe(false);
  });

  it("allows TO to GENERAL changes while TO recruitment remains enabled", () => {
    expect(
      shouldBlockDisabledTechnicalOfficialDowngrade({
        existingPositionName: "テクニカルオフィシャル（東京LSC）",
        nextEntryType: "GENERAL",
        technicalOfficialRecruitmentEnabled: true,
      })
    ).toBe(false);
  });
});
