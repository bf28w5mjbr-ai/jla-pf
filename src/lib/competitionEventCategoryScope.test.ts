import { describe, expect, it } from "vitest";
import { resolveCompetitionEventCategoryScope } from "./competitionEventCategoryScope";

describe("resolveCompetitionEventCategoryScope", () => {
  it("空はプールのみ扱い", () => {
    expect(resolveCompetitionEventCategoryScope(null)).toBe("POOL_ONLY");
    expect(resolveCompetitionEventCategoryScope("  ")).toBe("POOL_ONLY");
  });

  it("オーシャンのみならオーシャン専用", () => {
    expect(resolveCompetitionEventCategoryScope("オーシャン")).toBe("OCEAN_ONLY");
    expect(resolveCompetitionEventCategoryScope("Ocean")).toBe("OCEAN_ONLY");
  });

  it("オープンウォーター表記もオーシャン専用", () => {
    expect(resolveCompetitionEventCategoryScope("オープンウォーター")).toBe("OCEAN_ONLY");
    expect(resolveCompetitionEventCategoryScope("Open Water")).toBe("OCEAN_ONLY");
  });

  it("プールを含むと混合扱いでプール側に寄せる", () => {
    expect(resolveCompetitionEventCategoryScope("プール・オーシャン")).toBe("POOL_ONLY");
    expect(resolveCompetitionEventCategoryScope("Pool & Ocean")).toBe("POOL_ONLY");
  });
});
