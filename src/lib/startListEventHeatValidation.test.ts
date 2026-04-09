import { describe, expect, it } from "vitest";
import {
  clampRoundTabsToNonIncreasingHeatCounts,
  effectiveHeatCountsForRoundTabs,
  validateEventSettingsRoundTabHeatMonotonic,
} from "./startListEventHeatValidation";
import type { HeatSetting, StartListRoundTab } from "./startListSettings";

describe("effectiveHeatCountsForRoundTabs", () => {
  it("先頭自動＋後続手動で実効ヒート数を返す", () => {
    const tabs: StartListRoundTab[] = [
      {
        id: "a",
        label: "r1",
        mode: "count",
        heatCount: "1",
        heatSize: "",
      },
      {
        id: "b",
        label: "r2",
        mode: "count",
        heatCount: "4",
        heatSize: "",
      },
    ];
    const eff = effectiveHeatCountsForRoundTabs(tabs, 32, 8);
    expect(eff[0]).toBe(4);
    expect(eff[1]).toBe(4);
  });
});

describe("clampRoundTabsToNonIncreasingHeatCounts", () => {
  it("後続が前を超える場合は繰り下げる", () => {
    const tabs: StartListRoundTab[] = [
      {
        id: "a",
        label: "r1",
        mode: "count",
        heatCount: "3",
        heatSize: "",
      },
      {
        id: "b",
        label: "r2",
        mode: "count",
        heatCount: "5",
        heatSize: "",
      },
    ];
    const out = clampRoundTabsToNonIncreasingHeatCounts(tabs, 0, null);
    expect(out[1]!.heatCount).toBe("3");
  });
});

describe("validateEventSettingsRoundTabHeatMonotonic", () => {
  it("単調でない設定は拒否", () => {
    const eventSettings: Record<string, HeatSetting> = {
      e1: {
        roundTabs: [
          {
            id: "a",
            label: "r1",
            mode: "count",
            heatCount: "2",
            heatSize: "",
          },
          {
            id: "b",
            label: "r2",
            mode: "count",
            heatCount: "5",
            heatSize: "",
          },
        ],
        mode: "count",
        heatCount: "2",
        heatSize: "",
      },
    };
    const r = validateEventSettingsRoundTabHeatMonotonic(eventSettings, {
      e1: { entryCount: 0, preliminaryHeatLaneCount: null },
    });
    expect(r.ok).toBe(false);
  });

  it("非増加なら通過", () => {
    const eventSettings: Record<string, HeatSetting> = {
      e1: {
        roundTabs: [
          {
            id: "a",
            label: "r1",
            mode: "count",
            heatCount: "4",
            heatSize: "",
          },
          {
            id: "b",
            label: "r2",
            mode: "count",
            heatCount: "2",
            heatSize: "",
          },
        ],
        mode: "count",
        heatCount: "4",
        heatSize: "",
      },
    };
    const r = validateEventSettingsRoundTabHeatMonotonic(eventSettings, {
      e1: { entryCount: 0, preliminaryHeatLaneCount: null },
    });
    expect(r.ok).toBe(true);
  });
});
