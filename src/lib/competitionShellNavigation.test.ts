import { describe, expect, it } from "vitest";
import {
  competitionOverviewHref,
  competitionResultsTabHref,
} from "./competitionShellNavigation";

describe("competitionShellNavigation", () => {
  it("ログイン済みは会員大会詳細へ", () => {
    expect(competitionResultsTabHref("c1", true)).toBe("/competitions/c1?tab=results");
    expect(competitionOverviewHref("c1", true)).toBe("/competitions/c1");
  });

  it("未ログインは公開大会詳細へ", () => {
    expect(competitionResultsTabHref("c1", false)).toBe(
      "/competitions/view/c1?tab=results"
    );
    expect(competitionOverviewHref("c1", false)).toBe("/competitions/view/c1");
  });
});
