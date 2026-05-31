import { describe, expect, it } from "vitest";
import {
  headHeatPlanSplitFingerprint,
  heatPlanSplitFingerprint,
} from "@/lib/eventHeatPlanMarshal";
import { eventIdsWhereHeatPlanSplitChanged } from "@/lib/startListSnapshot";
import type { HeatSetting } from "@/lib/startListSettings";

const headTab = {
  id: "1",
  label: "heat",
  mode: "count" as const,
  heatCount: "2",
  heatSize: "",
  maxLanesPerHeat: 8,
};

describe("eventIdsWhereHeatPlanSplitChanged", () => {
  it("先頭タブの maxLanesPerHeat のみ変更した種目 id を返す", () => {
    const previous: Record<string, HeatSetting> = {
      ev1: { roundTabs: [headTab] },
    };
    const next: Record<string, HeatSetting> = {
      ev1: {
        roundTabs: [{ ...headTab, maxLanesPerHeat: 10 }],
      },
    };
    expect(
      eventIdsWhereHeatPlanSplitChanged({
        orderedEventIds: ["ev1"],
        previous,
        next,
      })
    ).toEqual(["ev1"]);
    expect(headHeatPlanSplitFingerprint(previous.ev1)).not.toBe(
      headHeatPlanSplitFingerprint(next.ev1)
    );
  });

  it("ラウンド数だけ増やした（2タブ目追加）場合は空配列", () => {
    const previous: Record<string, HeatSetting> = {
      ev1: { roundTabs: [headTab] },
    };
    const next: Record<string, HeatSetting> = {
      ev1: {
        roundTabs: [
          headTab,
          {
            id: "2",
            label: "semi",
            mode: "count",
            heatCount: "1",
            heatSize: "",
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
    ).toEqual([]);
    expect(heatPlanSplitFingerprint(previous.ev1)).not.toBe(heatPlanSplitFingerprint(next.ev1));
    expect(headHeatPlanSplitFingerprint(previous.ev1)).toBe(headHeatPlanSplitFingerprint(next.ev1));
  });

  it("2タブ目以降のヒート分割だけ変えた場合は空配列", () => {
    const previous: Record<string, HeatSetting> = {
      ev1: {
        roundTabs: [
          headTab,
          {
            id: "2",
            label: "semi",
            mode: "count",
            heatCount: "1",
            heatSize: "",
          },
        ],
      },
    };
    const next: Record<string, HeatSetting> = {
      ev1: {
        roundTabs: [
          headTab,
          {
            id: "2",
            label: "semi",
            mode: "count",
            heatCount: "3",
            heatSize: "",
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
    ).toEqual([]);
  });

  it("先頭タブの heatCount 変更時のみ該当種目 id を返す", () => {
    const previous: Record<string, HeatSetting> = {
      ev1: { roundTabs: [headTab] },
      ev2: { roundTabs: [{ ...headTab, id: "a" }] },
    };
    const next: Record<string, HeatSetting> = {
      ev1: { roundTabs: [{ ...headTab, heatCount: "3" }] },
      ev2: { roundTabs: [{ ...headTab, id: "a" }] },
    };
    expect(
      eventIdsWhereHeatPlanSplitChanged({
        orderedEventIds: ["ev1", "ev2"],
        previous,
        next,
      })
    ).toEqual(["ev1"]);
  });
});
