import { describe, expect, it } from "vitest";
import {
  clubTeamNameBaseFromClub,
  isClubBaseWithLetterSuffixTeamName,
  shouldStripLetterSuffixForSingleTeam,
} from "@/lib/teamEntryClubBaseName";

describe("teamEntryClubBaseName", () => {
  it("clubTeamNameBaseFromClub は略称優先", () => {
    expect(
      clubTeamNameBaseFromClub({ abbreviation: " 西浜 ", name: "西浜サーフライフセービングクラブ" })
    ).toBe("西浜");
    expect(clubTeamNameBaseFromClub({ abbreviation: null, name: " 東京 " })).toBe("東京");
  });

  it("isClubBaseWithLetterSuffixTeamName", () => {
    expect(isClubBaseWithLetterSuffixTeamName("西浜", "西浜 A")).toBe(true);
    expect(isClubBaseWithLetterSuffixTeamName("西浜", "西浜 AA")).toBe(true);
    expect(isClubBaseWithLetterSuffixTeamName("西浜", "西浜")).toBe(false);
    expect(isClubBaseWithLetterSuffixTeamName("西浜", "西浜サーフ A")).toBe(false);
    expect(isClubBaseWithLetterSuffixTeamName("西浜", "西浜 a")).toBe(false);
  });

  it("shouldStripLetterSuffixForSingleTeam は正式名+Aも検出（略称あり）", () => {
    const club = {
      abbreviation: "西浜",
      name: "西浜サーフライフセービングクラブ",
    };
    expect(shouldStripLetterSuffixForSingleTeam(club, "西浜 A")).toBe(true);
    expect(shouldStripLetterSuffixForSingleTeam(club, "西浜サーフライフセービングクラブ A")).toBe(true);
    expect(shouldStripLetterSuffixForSingleTeam(club, "西浜サーフライフセービングクラブ")).toBe(false);
    expect(shouldStripLetterSuffixForSingleTeam(club, "別クラブ名 A")).toBe(false);
  });
});
