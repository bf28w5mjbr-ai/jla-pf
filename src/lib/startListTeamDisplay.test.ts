import { describe, expect, it } from "vitest";
import {
  secondaryClubLabelForTeamRow,
  secondaryClubLineForIndividual,
} from "@/lib/startListTeamDisplay";

describe("startListTeamDisplay", () => {
  describe("secondaryClubLabelForTeamRow", () => {
    it("チーム種目では括弧のクラブを出さない", () => {
      expect(secondaryClubLabelForTeamRow("西浜 A", "西浜サーフライフセービングクラブ")).toBeNull();
      expect(secondaryClubLabelForTeamRow("西浜", "西浜")).toBeNull();
      expect(secondaryClubLabelForTeamRow("カスタム名", null)).toBeNull();
    });
  });

  describe("secondaryClubLineForIndividual", () => {
    it("クラブ名があれば返す", () => {
      expect(secondaryClubLineForIndividual(" 東京クラブ ")).toBe("東京クラブ");
    });

    it("未設定なら null", () => {
      expect(secondaryClubLineForIndividual(null)).toBeNull();
      expect(secondaryClubLineForIndividual("  ")).toBeNull();
    });
  });
});
