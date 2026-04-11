import { describe, expect, it } from "vitest";
import {
  buildStoredCompetitionEventName,
  extractTabInnerCompetitionEventName,
} from "./competitionEventStoredName";

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

  it("年齢カテゴリありのときは カテゴリ名＋タブ内種目名の連結", () => {
    expect(
      buildStoredCompetitionEventName({
        tabInnerName: "障害物スイム（200m）",
        ageCategoryId: "cat1",
        ageCategoryName: "ジュニア",
      })
    ).toBe("ジュニア障害物スイム（200m）");
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

describe("extractTabInnerCompetitionEventName", () => {
  it("新形式からタブ内名を取り出す", () => {
    expect(
      extractTabInnerCompetitionEventName("U-18サーフレース", "U-18")
    ).toBe("サーフレース");
  });

  it("旧形式からタブ内名を取り出す", () => {
    expect(
      extractTabInnerCompetitionEventName(
        "サーフレース（U-18＋サーフレース）",
        "U-18"
      )
    ).toBe("サーフレース");
  });
});
