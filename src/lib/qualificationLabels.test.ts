import { describe, expect, it } from "vitest";
import { qualificationTemplateValidityLabel } from "@/lib/qualificationLabels";

describe("qualificationTemplateValidityLabel", () => {
  it("requiresExpiry かつ有効な validityMonths なら有効期間を出す", () => {
    expect(
      qualificationTemplateValidityLabel({ requiresExpiry: true, validityMonths: 12 })
    ).toBe("有効期間: 12か月");
  });

  it("requiresExpiry かつ期間未設定ならその旨を出す", () => {
    expect(
      qualificationTemplateValidityLabel({ requiresExpiry: true, validityMonths: null })
    ).toBe("有効期限あり（期間未設定）");
    expect(
      qualificationTemplateValidityLabel({ requiresExpiry: true, validityMonths: undefined })
    ).toBe("有効期限あり（期間未設定）");
    expect(
      qualificationTemplateValidityLabel({ requiresExpiry: true, validityMonths: 0 })
    ).toBe("有効期限あり（期間未設定）");
    expect(
      qualificationTemplateValidityLabel({ requiresExpiry: true, validityMonths: 1.5 })
    ).toBe("有効期限あり（期間未設定）");
  });

  it("requiresExpiry が false なら有効期限なし", () => {
    expect(
      qualificationTemplateValidityLabel({ requiresExpiry: false, validityMonths: null })
    ).toBe("有効期限なし");
    expect(
      qualificationTemplateValidityLabel({ requiresExpiry: false, validityMonths: 24 })
    ).toBe("有効期限なし");
  });
});
