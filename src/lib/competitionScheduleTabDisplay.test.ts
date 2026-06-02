import { describe, expect, it } from "vitest";
import {
  filterScheduleTabsWithRows,
  resolveVisibleScheduleAreaTabId,
} from "@/lib/competitionScheduleTabDisplay";

describe("filterScheduleTabsWithRows", () => {
  it("keeps tabs with row count > 0 across all days", () => {
    const tabs = [
      { id: "main", name: "メイン" },
      { id: "sub", name: "サブ" },
    ];
    expect(filterScheduleTabsWithRows(tabs, { main: 0, sub: 3 })).toEqual([{ id: "sub", name: "サブ" }]);
  });
});

describe("resolveVisibleScheduleAreaTabId", () => {
  const tabs = [
    { id: "main", name: "メイン" },
    { id: "sub", name: "サブ" },
  ];
  const counts = { main: 0, sub: 2 };

  it("falls back from empty active tab to first tab with rows", () => {
    expect(resolveVisibleScheduleAreaTabId("main", tabs, counts)).toBe("sub");
  });

  it("keeps active tab when it has rows", () => {
    expect(resolveVisibleScheduleAreaTabId("sub", tabs, counts)).toBe("sub");
  });

  it("keeps active id when all tabs are empty", () => {
    expect(resolveVisibleScheduleAreaTabId("main", tabs, { main: 0, sub: 0 })).toBe("main");
  });
});
