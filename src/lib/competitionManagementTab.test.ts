import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseCompetitionManagementTab,
  parseOfficialSubTab,
  resolveCompetitionManagementActiveTab,
} from "./competitionManagementTab";

describe("parseCompetitionManagementTab", () => {
  it("returns official for exact match", () => {
    expect(parseCompetitionManagementTab("official")).toBe("official");
  });

  it("normalizes case and whitespace", () => {
    expect(parseCompetitionManagementTab("  OFFICIAL  ")).toBe("official");
  });

  it("uses first value when tab is string[]", () => {
    expect(parseCompetitionManagementTab(["official", "page"])).toBe("official");
  });

  it("falls back to page for unknown tab", () => {
    expect(parseCompetitionManagementTab("other")).toBe("page");
  });

  it("falls back to page for empty string", () => {
    expect(parseCompetitionManagementTab("")).toBe("page");
  });

  it("falls back to page for undefined", () => {
    expect(parseCompetitionManagementTab(undefined)).toBe("page");
  });
});

describe("parseOfficialSubTab", () => {
  it("returns manage by default", () => {
    expect(parseOfficialSubTab(undefined)).toBe("manage");
    expect(parseOfficialSubTab("")).toBe("manage");
    expect(parseOfficialSubTab("other")).toBe("manage");
  });

  it("returns dayops for exact match", () => {
    expect(parseOfficialSubTab("dayops")).toBe("dayops");
  });

  it("normalizes case and whitespace", () => {
    expect(parseOfficialSubTab("  DAYOPS  ")).toBe("dayops");
  });

  it("uses first value when string[]", () => {
    expect(parseOfficialSubTab(["dayops", "manage"])).toBe("dayops");
    expect(parseOfficialSubTab(["manage", "dayops"])).toBe("manage");
  });
});

describe("resolveCompetitionManagementActiveTab", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("delegates to parse for searchParams.tab", () => {
    expect(resolveCompetitionManagementActiveTab({ tab: "entries" })).toBe("entries");
    expect(resolveCompetitionManagementActiveTab({ tab: ["finance"] })).toBe("finance");
    expect(resolveCompetitionManagementActiveTab({})).toBe("page");
  });

  it("logs in development only (no throw)", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveCompetitionManagementActiveTab({ tab: "official" })).toBe("official");
    expect(spy).toHaveBeenCalled();
  });

  it("does not log in production", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveCompetitionManagementActiveTab({ tab: "official" })).toBe("official");
    expect(spy).not.toHaveBeenCalled();
  });
});
