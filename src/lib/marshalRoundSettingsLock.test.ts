import { describe, expect, it, vi } from "vitest";
import {
  eventHasMarshalCallClosedRound,
  eventHeatRoundMarshalCallClosed,
  findLockedTabSettingViolation,
  getMarshalActiveRoundsForEvents,
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
    expect(message).toMatch(/締切済み/);
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
    expect(message).toMatch(/締切済み/);
  });
});

describe("getMarshalActiveRoundsForEvents", () => {
  it("callClosedAt があるヒートの round を locked に含める", async () => {
    const findMany = vi.fn().mockResolvedValue([{ eventId: "ev1", round: "HEAT" }]);
    const result = await getMarshalActiveRoundsForEvents(
      { competitionHeatMarshalState: { findMany } } as never,
      "c1",
      ["ev1"]
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          competitionId: "c1",
          callClosedAt: { not: null },
        }),
      })
    );
    expect([...(result.get("ev1") ?? [])]).toEqual(["HEAT"]);
  });

  it("締切行がなければ空 Set", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const result = await getMarshalActiveRoundsForEvents(
      { competitionHeatMarshalState: { findMany } } as never,
      "c1",
      ["ev1"]
    );
    expect([...(result.get("ev1") ?? [])]).toEqual([]);
  });
});

describe("marshal call closed helpers", () => {
  it("eventHasMarshalCallClosedRound / eventHeatRoundMarshalCallClosed", () => {
    const map = new Map([["ev1", new Set(["HEAT" as const])]]);
    expect(eventHasMarshalCallClosedRound(map, "ev1")).toBe(true);
    expect(eventHeatRoundMarshalCallClosed(map, "ev1")).toBe(true);
    expect(eventHasMarshalCallClosedRound(map, "ev2")).toBe(false);
    expect(eventHeatRoundMarshalCallClosed(map, "ev2")).toBe(false);
  });
});
