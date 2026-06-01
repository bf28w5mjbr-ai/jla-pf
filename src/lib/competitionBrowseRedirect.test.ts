import { describe, expect, it } from "vitest";
import { getCompetitionBrowseRedirect } from "./competitionBrowseRedirect";

describe("getCompetitionBrowseRedirect", () => {
  it("未ログインの /competitions を公開一覧へ", () => {
    expect(getCompetitionBrowseRedirect("/competitions", "", false)).toBe("/browse/competitions");
    expect(getCompetitionBrowseRedirect("/competitions", "?q=test", false)).toBe(
      "/browse/competitions?q=test"
    );
  });

  it("ログイン済みの /browse/competitions を会員一覧へ", () => {
    expect(getCompetitionBrowseRedirect("/browse/competitions", "", true)).toBe("/competitions");
  });

  it("未ログインの詳細を view へ", () => {
    expect(getCompetitionBrowseRedirect("/competitions/abc", "", false)).toBe(
      "/competitions/view/abc"
    );
    expect(getCompetitionBrowseRedirect("/competitions/abc", "?tab=results", false)).toBe(
      "/competitions/view/abc?tab=results"
    );
  });

  it("ログイン済みの view を会員詳細へ", () => {
    expect(getCompetitionBrowseRedirect("/competitions/view/abc", "?tab=results", true)).toBe(
      "/competitions/abc?tab=results"
    );
  });

  it("子パス・予約セグメントはリダイレクトしない", () => {
    expect(getCompetitionBrowseRedirect("/competitions/abc/entry", "", false)).toBeNull();
    expect(getCompetitionBrowseRedirect("/competitions/create", "", false)).toBeNull();
    expect(getCompetitionBrowseRedirect("/competitions/abc/start-list", "", false)).toBeNull();
    expect(getCompetitionBrowseRedirect("/dashboard", "", false)).toBeNull();
  });
});
