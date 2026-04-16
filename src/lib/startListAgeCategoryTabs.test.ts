import { describe, expect, it } from "vitest";
import {
  START_LIST_UNCATEGORIZED_KEY,
  buildStartListAgeCategoryTabs,
  filterEventsByStartListAgeCategory,
  mergeReorderedEventsByIds,
} from "./startListAgeCategoryTabs";

describe("startListAgeCategoryTabs", () => {
  const events = [
    { id: "e1", ageCategoryId: "c1", ageCategoryName: "U-12" },
    { id: "e2", ageCategoryId: "c1", ageCategoryName: "U-12" },
    { id: "e3", ageCategoryId: "c2", ageCategoryName: "OPEN" },
    { id: "e4", ageCategoryId: null, ageCategoryName: null },
  ];

  it("buildStartListAgeCategoryTabs groups by category and appends uncategorized", () => {
    const tabs = buildStartListAgeCategoryTabs(events);
    expect(tabs).toEqual([
      { key: "c2", label: "OPEN", count: 1 },
      { key: "c1", label: "U-12", count: 2 },
      { key: START_LIST_UNCATEGORIZED_KEY, label: "未分類", count: 1 },
    ]);
  });

  it("filterEventsByStartListAgeCategory returns scoped events only", () => {
    expect(filterEventsByStartListAgeCategory(events, "c1").map((event) => event.id)).toEqual([
      "e1",
      "e2",
    ]);
    expect(
      filterEventsByStartListAgeCategory(events, START_LIST_UNCATEGORIZED_KEY).map(
        (event) => event.id
      )
    ).toEqual(["e4"]);
  });

  it("mergeReorderedEventsByIds rewrites only visible subset order", () => {
    const all = [
      { id: "a" },
      { id: "b" },
      { id: "x" },
      { id: "c" },
      { id: "d" },
    ];
    const merged = mergeReorderedEventsByIds(all, ["d", "c"]);
    expect(merged.map((item) => item.id)).toEqual(["a", "b", "x", "d", "c"]);
  });
});
