import { describe, expect, it } from "vitest";
import { heatPlanSplitFingerprint } from "@/lib/eventHeatPlanMarshal";
import type { HeatSetting } from "@/lib/startListSettings";

describe("heatPlanSplitFingerprint", () => {
  it("maxLanesPerHeat のみ変更で fingerprint が変わる", () => {
    const base: HeatSetting = {
      roundTabs: [
        {
          id: "1",
          label: "予選",
          mode: "count",
          heatCount: "2",
          heatSize: "",
          maxLanesPerHeat: 8,
        },
      ],
    };
    const changed: HeatSetting = {
      roundTabs: [
        {
          id: "1",
          label: "予選",
          mode: "count",
          heatCount: "2",
          heatSize: "",
          maxLanesPerHeat: 10,
        },
      ],
    };
    expect(heatPlanSplitFingerprint(base)).not.toBe(heatPlanSplitFingerprint(changed));
  });

  it("ラベル変更だけでは fingerprint は変わらない", () => {
    const a: HeatSetting = {
      roundTabs: [
        {
          id: "1",
          label: "予選A",
          mode: "count",
          heatCount: "2",
          heatSize: "",
          maxLanesPerHeat: 8,
        },
      ],
    };
    const b: HeatSetting = {
      roundTabs: [
        {
          id: "2",
          label: "予選B",
          mode: "count",
          heatCount: "2",
          heatSize: "",
          maxLanesPerHeat: 8,
        },
      ],
    };
    expect(heatPlanSplitFingerprint(a)).toBe(heatPlanSplitFingerprint(b));
  });
});
