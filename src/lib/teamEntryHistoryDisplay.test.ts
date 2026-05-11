import { describe, expect, it } from "vitest";
import { formatTeamNamesCompactByClubPrefix } from "@/lib/teamEntryHistoryDisplay";

describe("formatTeamNamesCompactByClubPrefix", () => {
  const club = "西浜サーフライフセービングクラブ";

  it("全件がクラブ名で始まるとき接尾辞だけに省略し title に全文", () => {
    const r = formatTeamNamesCompactByClubPrefix(club, [
      `${club} A`,
      `${club} B`,
    ]);
    expect(r.display).toBe("A、B");
    expect(r.title).toBe(`${club} A、${club} B`);
  });

  it("1件でもプレフィックス不一致なら全文のまま", () => {
    const r = formatTeamNamesCompactByClubPrefix(club, [`${club} A`, "別チーム B"]);
    expect(r.display).toBe(`${club} A、別チーム B`);
    expect(r.title).toBeUndefined();
  });

  it("プレフィックス除去後が空なら全文（誤省略防止）", () => {
    const r = formatTeamNamesCompactByClubPrefix(club, [club, `${club} A`]);
    expect(r.display).toBe(`${club}、${club} A`);
    expect(r.title).toBeUndefined();
  });

  it("NFKC で表記が揃えば省略できる", () => {
    const r = formatTeamNamesCompactByClubPrefix("テストクラブ", ["テストクラブＡ"]);
    expect(r.display).toBe("A");
    expect(r.title).toBe("テストクラブＡ");
  });
});
