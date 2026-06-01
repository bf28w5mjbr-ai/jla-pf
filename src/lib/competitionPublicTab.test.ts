import { describe, expect, it } from "vitest";
import { parseCompetitionPublicTab } from "./competitionPublicTab";

describe("parseCompetitionPublicTab", () => {
  it("results を返す", () => {
    expect(parseCompetitionPublicTab("results")).toBe("results");
  });

  it("未指定は overview", () => {
    expect(parseCompetitionPublicTab(undefined)).toBe("overview");
    expect(parseCompetitionPublicTab(null)).toBe("overview");
  });

  it("旧 start-list は競技結果タブ（スタートリスト）へ", () => {
    expect(parseCompetitionPublicTab("start-list")).toBe("results");
  });
});
