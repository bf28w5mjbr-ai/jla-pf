import { describe, expect, it } from "vitest";
import { heatPlanSplitFingerprint } from "@/lib/eventHeatPlanMarshal";
import { eventIdsWhereHeatPlanSplitChanged } from "@/lib/startListSnapshot";
import type { HeatSetting } from "@/lib/startListSettings";

describe("eventIdsWhereHeatPlanSplitChanged", () => {
  it("maxLanesPerHeat のみ変更した種目 id を返す", () => {
    const previous: Record<string, HeatSetting> = {
      ev1: {
        roundTabs: [
          {
            id: "1",
            label: "h",
            mode: "count",
            heatCount: "2",
            heatSize: "",
            maxLanesPerHeat: 8,
          },
        ],
      },
    };
    const next: Record<string, HeatSetting> = {
      ev1: {
        roundTabs: [
          {
            id: "1",
            label: "h",
            mode: "count",
            heatCount: "2",
            heatSize: "",
            maxLanesPerHeat: 10,
          },
        ],
      },
    };
    expect(
      eventIdsWhereHeatPlanSplitChanged({
        orderedEventIds: ["ev1"],
        previous,
        next,
      })
    ).toEqual(["ev1"]);
    expect(heatPlanSplitFingerprint(previous.ev1)).not.toBe(heatPlanSplitFingerprint(next.ev1));
  });
});
