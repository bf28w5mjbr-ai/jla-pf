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
    expect(isClubBaseWithLetterSuffixTeamName("西浜", "西浜　A")).toBe(true);
    expect(isClubBaseWithLetterSuffixTeamName("西浜", "西浜Ａ")).toBe(true);
    expect(isClubBaseWithLetterSuffixTeamName("西浜", "西浜")).toBe(false);
    expect(isClubBaseWithLetterSuffixTeamName("西浜", "西浜サーフ A")).toBe(false);
    expect(isClubBaseWithLetterSuffixTeamName("西浜", "西浜 a")).toBe(false);
  });

  it("正式名ベースで全角Ａ・スペース無しも検出", () => {
    const base = "西浜サーフライフセービングクラブ";
    expect(isClubBaseWithLetterSuffixTeamName(base, `${base} A`)).toBe(true);
    expect(isClubBaseWithLetterSuffixTeamName(base, `${base}\u3000Ａ`)).toBe(true);
    expect(isClubBaseWithLetterSuffixTeamName(base, `${base}Ａ`)).toBe(true);
  });

  it("shouldStripLetterSuffixForSingleTeam は正式名+Aも検出（略称あり）", () => {
    const club = {
      abbreviation: "西浜",
      name: "西浜サーフライフセービングクラブ",
    };
    expect(shouldStripLetterSuffixForSingleTeam(club, "西浜 A")).toBe(true);
    expect(shouldStripLetterSuffixForSingleTeam(club, "西浜サーフライフセービングクラブ A")).toBe(true);
    expect(
      shouldStripLetterSuffixForSingleTeam(club, "西浜サーフライフセービングクラブ\u3000A")
    ).toBe(true);
    expect(shouldStripLetterSuffixForSingleTeam(club, "西浜サーフライフセービングクラブ")).toBe(false);
    expect(shouldStripLetterSuffixForSingleTeam(club, "別クラブ名 A")).toBe(false);
  });

  it("略称なしの他クラブでも同じルールが効く", () => {
    const club = { abbreviation: null as string | null, name: "大阪ライフセービング協会" };
    expect(shouldStripLetterSuffixForSingleTeam(club, "大阪ライフセービング協会 B")).toBe(true);
    expect(shouldStripLetterSuffixForSingleTeam(club, "大阪ライフセービング協会")).toBe(false);
  });
});
