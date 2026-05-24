import { describe, expect, it } from "vitest";
import {
  mergeBulkSaveItemsIntoEventSettings,
  parseRoundSetupBulkSaveItems,
} from "./roundSetupBulkSave";

describe("parseRoundSetupBulkSaveItems", () => {
  it("roundTabs.length と startListRoundCount が一致することを要求", () => {
    const result = parseRoundSetupBulkSaveItems([
      {
        eventId: "ev1",
        startListRoundCount: 2,
        roundTabs: [
          { id: "a", label: "semi", mode: "count", heatCount: "2", heatSize: "" },
        ],
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("一致しません");
    }
  });

  it("有効な items をパースする", () => {
    const result = parseRoundSetupBulkSaveItems([
      {
        eventId: "ev1",
        startListRoundCount: 2,
        roundTabs: [
          { id: "a", label: "semi", mode: "count", heatCount: "2", heatSize: "" },
          { id: "b", label: "final", mode: "count", heatCount: "1", heatSize: "" },
        ],
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.roundTabs).toHaveLength(2);
    }
  });
});

describe("mergeBulkSaveItemsIntoEventSettings", () => {
  it("roundTabs のみ永続化し progressionHeatCounts を維持", () => {
    const existing = {
      eventSettings: {
        ev1: {
          mode: "count" as const,
          heatCount: "9",
          heatSize: "",
          progressionHeatCounts: [3, 1],
        },
      },
      teamAssignmentDeadline: null,
    };
    const merged = mergeBulkSaveItemsIntoEventSettings(existing, [
      {
        eventId: "ev1",
        startListRoundCount: 1,
        roundTabs: [
          { id: "a", label: "final", mode: "count", heatCount: "1", heatSize: "" },
        ],
      },
    ]);
    expect(merged.ev1!.mode).toBeUndefined();
    expect(merged.ev1!.roundTabs).toHaveLength(1);
    expect(merged.ev1!.progressionHeatCounts).toEqual([3, 1]);
  });
});
