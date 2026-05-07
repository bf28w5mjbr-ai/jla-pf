import { describe, expect, it } from "vitest";
import {
  extractTechnicalOfficialClubDisplayNameFromPosition,
} from "@/lib/resolveTechnicalOfficialApplicationClub";

describe("extractTechnicalOfficialClubDisplayNameFromPosition", () => {
  it("parses standard TO position title", () => {
    expect(
      extractTechnicalOfficialClubDisplayNameFromPosition("テクニカルオフィシャル（湘南LW）")
    ).toBe("湘南LW");
  });

  it("trims inner club label", () => {
    expect(
      extractTechnicalOfficialClubDisplayNameFromPosition("テクニカルオフィシャル（  みなみ  ）")
    ).toBe("みなみ");
  });

  it("returns null for non TO patterns", () => {
    expect(extractTechnicalOfficialClubDisplayNameFromPosition("オフィシャル")).toBeNull();
    expect(extractTechnicalOfficialClubDisplayNameFromPosition("")).toBeNull();
  });
});
