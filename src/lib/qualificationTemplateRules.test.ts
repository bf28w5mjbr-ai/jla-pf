import { describe, expect, it } from "vitest";
import {
  resolveQualificationTemplateMeta,
  stripLegacyQualificationTemplateMetaLines,
} from "@/lib/qualificationTemplateRules";

describe("resolveQualificationTemplateMeta", () => {
  it("構造化カラムだけをメタ情報として返す", () => {
    const meta = resolveQualificationTemplateMeta({
      description: [
        "Domain: Legacy",
        "Level: Legacy",
        "MinAge: 99",
        "Prerequisites: LegacyA AND LegacyB",
        "Next: LegacyNext",
      ].join("\n"),
      domain: "Surf",
      level: "Basic",
      minAge: 15,
      prerequisiteExpression: "BLS AND WaterSafety",
      nextKinds: ["AdvancedSurfLifesaver"],
    });

    expect(meta).toEqual({
      domain: "Surf",
      level: "Basic",
      minAge: 15,
      prerequisiteExpression: "BLS AND WaterSafety",
      nextKinds: ["AdvancedSurfLifesaver"],
    });
  });

  it("空の nextKinds は次資格なしとして扱い、description から補完しない", () => {
    const meta = resolveQualificationTemplateMeta({
      description: "Next: LegacyNext",
      nextKinds: [],
    });

    expect(meta.nextKinds).toEqual([]);
  });
});

describe("stripLegacyQualificationTemplateMetaLines", () => {
  it("旧 description メタ行だけを除去して人間向け説明文を残す", () => {
    const description = stripLegacyQualificationTemplateMetaLines(
      [
        "Domain: Surf",
        "Level: Basic",
        "Human readable note.",
        "Prerequisites: BLS AND WaterSafety",
        "TrainingHours: 21",
        "Another note.",
      ].join("\n")
    );

    expect(description).toBe("Human readable note.\nAnother note.");
  });

  it("説明文が旧メタ行だけなら null を返す", () => {
    expect(stripLegacyQualificationTemplateMetaLines("Domain: Surf\nNext: None")).toBeNull();
  });
});
