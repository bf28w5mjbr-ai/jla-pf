import { describe, expect, it } from "vitest";
import { isCompetitionEntryWindowOpen, resolveHeroEntryDisplay } from "./competitionEntryWindow";

const start = new Date("2026-06-01T00:00:00.000Z");
const end = new Date("2026-06-15T23:59:59.999Z");

describe("isCompetitionEntryWindowOpen", () => {
  it("期間内なら true", () => {
    expect(isCompetitionEntryWindowOpen(new Date("2026-06-10T12:00:00.000Z"), start, end)).toBe(
      true
    );
  });

  it("期間未設定なら false", () => {
    expect(isCompetitionEntryWindowOpen(new Date("2026-06-10T12:00:00.000Z"), null, end)).toBe(
      false
    );
  });
});

describe("resolveHeroEntryDisplay", () => {
  const base = { entryStart: start, entryEnd: end, isOrgAdmin: false, showEntryLinksBase: true };

  it("種目なし等で base が false なら非表示", () => {
    expect(
      resolveHeroEntryDisplay({
        ...base,
        now: new Date("2026-06-10T12:00:00.000Z"),
        showEntryLinksBase: false,
      })
    ).toEqual({ showSection: false, mode: null, isEntryWindowOpen: true });
  });

  it("期間未設定ならフル表示", () => {
    expect(
      resolveHeroEntryDisplay({
        now: new Date("2026-06-10T12:00:00.000Z"),
        entryStart: null,
        entryEnd: end,
        isOrgAdmin: false,
        showEntryLinksBase: true,
      })
    ).toEqual({ showSection: true, mode: "full", isEntryWindowOpen: false });
  });

  it("受付中は一般ユーザーもフル", () => {
    expect(
      resolveHeroEntryDisplay({
        ...base,
        now: new Date("2026-06-10T12:00:00.000Z"),
      })
    ).toEqual({ showSection: true, mode: "full", isEntryWindowOpen: true });
  });

  it("開始前は一般ユーザーはプレビュー", () => {
    expect(
      resolveHeroEntryDisplay({
        ...base,
        now: new Date("2026-05-20T12:00:00.000Z"),
      })
    ).toEqual({ showSection: true, mode: "preview", isEntryWindowOpen: false });
  });

  it("終了後は一般ユーザーは非表示", () => {
    expect(
      resolveHeroEntryDisplay({
        ...base,
        now: new Date("2026-06-20T12:00:00.000Z"),
      })
    ).toEqual({ showSection: false, mode: null, isEntryWindowOpen: false });
  });

  it("開始前でも主催管理者はフル", () => {
    expect(
      resolveHeroEntryDisplay({
        ...base,
        now: new Date("2026-05-20T12:00:00.000Z"),
        isOrgAdmin: true,
      })
    ).toEqual({ showSection: true, mode: "full", isEntryWindowOpen: false });
  });

  it("終了後でも主催管理者はフル", () => {
    expect(
      resolveHeroEntryDisplay({
        ...base,
        now: new Date("2026-06-20T12:00:00.000Z"),
        isOrgAdmin: true,
      })
    ).toEqual({ showSection: true, mode: "full", isEntryWindowOpen: false });
  });
});
