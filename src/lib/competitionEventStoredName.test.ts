import { describe, expect, it } from "vitest";
import { buildStoredCompetitionEventName } from "./competitionEventStoredName";

describe("buildStoredCompetitionEventName", () => {
  it("未分類（ageCategoryId なし）はタブ内の入力のまま", () => {
    expect(
      buildStoredCompetitionEventName({
        tabInnerName: " 障害物スイム（200m） ",
        ageCategoryId: null,
        ageCategoryName: "ジュニア",
      })
    ).toBe("障害物スイム（200m）");
  });

  it("年齢カテゴリありのときは 種目名（カテゴリ名＋種目名）", () => {
    expect(
      buildStoredCompetitionEventName({
        tabInnerName: "障害物スイム（200m）",
        ageCategoryId: "cat1",
        ageCategoryName: "ジュニア",
      })
    ).toBe("障害物スイム（200m）（ジュニア＋障害物スイム（200m））");
  });

  it("カテゴリ名が空ならサフィックス付けない", () => {
    expect(
      buildStoredCompetitionEventName({
        tabInnerName: "サーフレース",
        ageCategoryId: "x",
        ageCategoryName: "   ",
      })
    ).toBe("サーフレース");
  });
});
