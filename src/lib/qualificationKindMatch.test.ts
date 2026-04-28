import { describe, expect, it } from "vitest";
import {
  findTemplateKindByKeywords,
  keywordMatchesNorm,
  matchesQualificationKeywords,
  resolveQualificationTemplateForKindInput,
} from "@/lib/qualificationKindMatch";

describe("keywordMatchesNorm", () => {
  it("短い正規化トークン同士は完全一致のみ（接頭誤爆しない）", () => {
    expect(keywordMatchesNorm("bls", "blsassistantinstructor")).toBe(false);
    expect(keywordMatchesNorm("bls", "bls")).toBe(true);
    expect(keywordMatchesNorm("irb", "irbcrew")).toBe(false);
  });

  it("長いフレーズ同士は部分一致を許可", () => {
    expect(keywordMatchesNorm("basiclifesavercourse", "basiclifesaver")).toBe(true);
  });
});

describe("resolveQualificationTemplateForKindInput", () => {
  const blsAssistantFirst = [
    { kind: "BLSAssistantInstructor", name: "BLSアシスタントインストラクター" },
    { kind: "BLS", name: "BLS" },
  ];

  it("BLS が BLSAssistantInstructor に誤解決しない（一覧順に依存しない）", () => {
    const resolved = resolveQualificationTemplateForKindInput(blsAssistantFirst, "BLS");
    expect(resolved?.kind).toBe("BLS");
  });

  it("kind の完全一致が最優先", () => {
    const resolved = resolveQualificationTemplateForKindInput(blsAssistantFirst, "BLSAssistantInstructor");
    expect(resolved?.kind).toBe("BLSAssistantInstructor");
  });
});

describe("findTemplateKindByKeywords", () => {
  const templates = [
    { kind: "BLS_WS", name: "BLS・WS（ベーシックライフセーバー）" },
    { kind: "CertifiedLifesaver", name: "認定ライフセーバー" },
  ];

  it("別名キーワードでテンプレート kind を解決できる", () => {
    expect(
      findTemplateKindByKeywords(templates, ["BLS・WS", "BLS/WS", "blsws", "ベーシックライフセーバー"])
    ).toBe("BLS_WS");
    expect(findTemplateKindByKeywords(templates, ["認定ライフセーバー", "certified lifesaver", "cls"])).toBe(
      "CertifiedLifesaver"
    );
  });
});

describe("matchesQualificationKeywords", () => {
  it("qualification.kind とテンプレート kind の突き合わせで誤爆しない", () => {
    expect(matchesQualificationKeywords("BLS", ["BLSAssistantInstructor"])).toBe(false);
    expect(matchesQualificationKeywords("BLS", ["BLS"])).toBe(true);
  });
});
