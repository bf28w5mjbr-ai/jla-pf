import { describe, expect, it } from "vitest";
import {
  parseStartListRefreshMeta,
  shouldRefreshStartListPage,
  type StartListRefreshMeta,
} from "./startListRefreshMeta";

describe("parseStartListRefreshMeta", () => {
  it("JSON から両フィールドを読む", () => {
    expect(
      parseStartListRefreshMeta({
        capturedAtIso: "2026-01-01T00:00:00.000Z",
        teamMembersRevisionIso: "2026-01-02T00:00:00.000Z",
      })
    ).toEqual({
      capturedAtIso: "2026-01-01T00:00:00.000Z",
      teamMembersRevisionIso: "2026-01-02T00:00:00.000Z",
    });
  });

  it("不正な入力は null にフォールバック", () => {
    expect(parseStartListRefreshMeta(null)).toEqual({
      capturedAtIso: null,
      teamMembersRevisionIso: null,
    });
  });
});

describe("shouldRefreshStartListPage", () => {
  const base: StartListRefreshMeta = {
    capturedAtIso: "2026-01-01T00:00:00.000Z",
    teamMembersRevisionIso: "2026-01-02T00:00:00.000Z",
  };

  it("初回（prev null）は refresh しない", () => {
    expect(shouldRefreshStartListPage(null, base)).toBe(false);
  });

  it("capturedAtIso のみ変化で refresh", () => {
    expect(
      shouldRefreshStartListPage(base, {
        ...base,
        capturedAtIso: "2026-01-03T00:00:00.000Z",
      })
    ).toBe(true);
  });

  it("teamMembersRevisionIso のみ変化で refresh", () => {
    expect(
      shouldRefreshStartListPage(base, {
        ...base,
        teamMembersRevisionIso: "2026-01-04T00:00:00.000Z",
      })
    ).toBe(true);
  });

  it("両方不変なら refresh しない", () => {
    expect(shouldRefreshStartListPage(base, { ...base })).toBe(false);
  });

  it("null から null への teamMembers 変化も 2 回目以降は refresh", () => {
    const prev: StartListRefreshMeta = {
      capturedAtIso: null,
      teamMembersRevisionIso: null,
    };
    expect(
      shouldRefreshStartListPage(prev, {
        capturedAtIso: null,
        teamMembersRevisionIso: "2026-01-05T00:00:00.000Z",
      })
    ).toBe(true);
  });
});
