import { describe, expect, it } from "vitest";
import {
  findLockedTabSettingViolation,
  roundTabSplitFingerprint,
} from "@/lib/marshalRoundSettingsLock";

describe("roundTabSplitFingerprint", () => {
  it("maxLanesPerHeat を含めて比較する", () => {
    const a = roundTabSplitFingerprint({
      id: "1",
      label: "h",
      mode: "count",
      heatCount: "2",
      heatSize: "",
      maxLanesPerHeat: 8,
    });
    const b = roundTabSplitFingerprint({
      id: "1",
      label: "h",
      mode: "count",
      heatCount: "2",
      heatSize: "",
      maxLanesPerHeat: 10,
    });
    expect(a).not.toBe(b);
  });
});

describe("findLockedTabSettingViolation", () => {
  it("locked HEAT タブの maxLanes 変更を拒否する", () => {
    const message = findLockedTabSettingViolation({
      previousSetting: {
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
      },
      nextSetting: {
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
      },
      previousRoundCount: 1,
      nextRoundCount: 1,
      lockedRounds: new Set(["HEAT"]),
    });
    expect(message).toMatch(/予選（HEAT）/);
  });

  it("FINAL のみ locked なら HEAT タブ変更は通る", () => {
    const message = findLockedTabSettingViolation({
      previousSetting: {
        roundTabs: [
          {
            id: "1",
            label: "予選",
            mode: "count",
            heatCount: "2",
            heatSize: "",
            maxLanesPerHeat: 8,
          },
          {
            id: "2",
            label: "決勝",
            mode: "count",
            heatCount: "1",
            heatSize: "",
          },
        ],
      },
      nextSetting: {
        roundTabs: [
          {
            id: "1",
            label: "予選",
            mode: "count",
            heatCount: "2",
            heatSize: "",
            maxLanesPerHeat: 10,
          },
          {
            id: "2",
            label: "決勝",
            mode: "count",
            heatCount: "1",
            heatSize: "",
          },
        ],
      },
      previousRoundCount: 2,
      nextRoundCount: 2,
      lockedRounds: new Set(["FINAL"]),
    });
    expect(message).toBeNull();
  });

  it("marshal active がある種目のラウンド数変更を拒否する", () => {
    const message = findLockedTabSettingViolation({
      previousSetting: {
        roundTabs: [
          {
            id: "1",
            label: "予選",
            mode: "count",
            heatCount: "2",
            heatSize: "",
          },
        ],
      },
      nextSetting: {
        roundTabs: [
          {
            id: "1",
            label: "予選",
            mode: "count",
            heatCount: "2",
            heatSize: "",
          },
          {
            id: "2",
            label: "決勝",
            mode: "count",
            heatCount: "1",
            heatSize: "",
          },
        ],
      },
      previousRoundCount: 1,
      nextRoundCount: 2,
      lockedRounds: new Set(["FINAL"]),
    });
    expect(message).toMatch(/ラウンド数/);
  });
});
