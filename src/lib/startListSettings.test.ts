import { describe, expect, it } from "vitest";
import {
  applyAutoFirstRoundTabFromMaxLanes,
  applyDefaultRoundTabLabels,
  buildRoundTabsForRoundCount,
  coerceRoundTabsToHeatOnly,
  defaultProgressionRoundLabels,
  defaultStartListRoundTabLabels,
  normalizeHeatSettingForPersist,
  normalizeRoundTabs,
  resolveEventRoundCount,
  resolveHeatCountForSnapshotTransition,
  resolveMaxLanesForSnapshotTransition,
  resolveRoundTabsForEvent,
  resolveTabMaxLanes,
} from "./startListSettings";

describe("resolveEventRoundCount", () => {
  it("roundTabs.length を優先する", () => {
    const settings = {
      events: {
        ev1: {
          roundTabs: [
            { id: "a", label: "q", mode: "count", heatCount: "1", heatSize: "" },
            { id: "b", label: "s", mode: "count", heatCount: "1", heatSize: "" },
            { id: "c", label: "f", mode: "count", heatCount: "1", heatSize: "" },
          ],
        },
      },
    };
    expect(resolveEventRoundCount("ev1", settings, 1)).toBe(3);
  });

  it("roundTabs が無いとき列に fallback", () => {
    expect(resolveEventRoundCount("ev1", {}, 2)).toBe(2);
  });
});

describe("normalizeHeatSettingForPersist", () => {
  it("roundTabs のみ永続化しトップレベル mode を落とす", () => {
    const out = normalizeHeatSettingForPersist({
      mode: "count",
      heatCount: "9",
      heatSize: "",
      roundTabs: [
        { id: "a", label: "f", mode: "count", heatCount: "1", heatSize: "" },
      ],
      progressionHeatCounts: [2, 1],
    });
    expect(out.mode).toBeUndefined();
    expect(out.heatCount).toBeUndefined();
    expect(out.roundTabs).toHaveLength(1);
    expect(out.progressionHeatCounts).toEqual([2, 1]);
  });
});

describe("resolveRoundTabsForEvent", () => {
  it("roundCount に合わせてタブ数を揃える", () => {
    const tabs = resolveRoundTabsForEvent({
      heatSetting: {
        roundTabs: [
          { id: "a", label: "f", mode: "count", heatCount: "1", heatSize: "" },
        ],
      },
      roundCount: 3,
    });
    expect(tabs).toHaveLength(3);
  });

  it("coerceToCount で size を count に変換", () => {
    const tabs = resolveRoundTabsForEvent({
      heatSetting: {
        roundTabs: [
          { id: "a", label: "f", mode: "size", heatCount: "1", heatSize: "8" },
        ],
      },
      roundCount: 1,
      entryCount: 16,
      coerceToCount: true,
    });
    expect(tabs[0]).toMatchObject({ mode: "count", heatCount: "2", heatSize: "" });
  });
});

describe("defaultProgressionRoundLabels", () => {
  it("matches 1〜6 ラウンドの規則（初回レース含む）", () => {
    expect(defaultProgressionRoundLabels(1)).toEqual(["final"]);
    expect(defaultProgressionRoundLabels(2)).toEqual(["semi", "final"]);
    expect(defaultProgressionRoundLabels(3)).toEqual(["quarter", "semi", "final"]);
    expect(defaultProgressionRoundLabels(4)).toEqual(["round1", "quarter", "semi", "final"]);
    expect(defaultProgressionRoundLabels(5)).toEqual([
      "round1",
      "round2",
      "quarter",
      "semi",
      "final",
    ]);
    expect(defaultProgressionRoundLabels(6)).toEqual([
      "round1",
      "round2",
      "round3",
      "quarter",
      "semi",
      "final",
    ]);
  });

  it("7 巡目は round4 まで接頭する", () => {
    expect(defaultProgressionRoundLabels(7)).toEqual([
      "round1",
      "round2",
      "round3",
      "round4",
      "quarter",
      "semi",
      "final",
    ]);
  });

  it("0 以下は空", () => {
    expect(defaultProgressionRoundLabels(0)).toEqual([]);
    expect(defaultProgressionRoundLabels(-1)).toEqual([]);
  });
});

describe("defaultStartListRoundTabLabels", () => {
  it("タブ数＝ラウンド数で defaultProgressionRoundLabels と一致（初回レース含む）", () => {
    for (let n = 1; n <= 6; n += 1) {
      expect(defaultStartListRoundTabLabels(n)).toEqual(defaultProgressionRoundLabels(n));
    }
    expect(defaultStartListRoundTabLabels(0)).toEqual([]);
  });
});

describe("applyDefaultRoundTabLabels", () => {
  it("id と分割は維持しラベルだけ付け替える", () => {
    const tabs = [
      { id: "a", label: "x", mode: "count" as const, heatCount: "1", heatSize: "" },
      { id: "b", label: "y", mode: "size" as const, heatCount: "2", heatSize: "4" },
    ];
    const out = applyDefaultRoundTabLabels(tabs);
    expect(out[0]).toMatchObject({
      id: "a",
      label: "semi",
      mode: "count",
      heatCount: "1",
      heatSize: "",
    });
    expect(out[1]).toMatchObject({
      id: "b",
      label: "final",
      mode: "size",
      heatCount: "2",
      heatSize: "4",
    });
  });
});

describe("applyAutoFirstRoundTabFromMaxLanes", () => {
  it("先頭タブを size + heatSize にし、ラベル等は維持する", () => {
    const tabs = [
      {
        id: "x",
        label: "semi",
        mode: "count" as const,
        heatCount: "9",
        heatSize: "8",
      },
      {
        id: "y",
        label: "final",
        mode: "count" as const,
        heatCount: "1",
        heatSize: "8",
      },
    ];
    const out = applyAutoFirstRoundTabFromMaxLanes(tabs, 8);
    expect(out[0]).toMatchObject({
      id: "x",
      label: "semi",
      mode: "count",
      heatSize: "",
      heatCount: "1",
    });
    expect(out[1]).toEqual(tabs[1]);
  });

  it("最大レーンが無効なときは変更しない", () => {
    const tabs = [
      { id: "a", label: "f", mode: "count" as const, heatCount: "2", heatSize: "" },
    ];
    expect(applyAutoFirstRoundTabFromMaxLanes(tabs, null)).toEqual(tabs);
  });

  it("先頭が手動（useAutoHeatFromMaxLanes: false）のとき先頭タブを上書きしない", () => {
    const tabs = [
      {
        id: "x",
        label: "semi",
        mode: "count" as const,
        heatCount: "4",
        heatSize: "8",
        useAutoHeatFromMaxLanes: false as const,
      },
    ];
    expect(applyAutoFirstRoundTabFromMaxLanes(tabs, 8)).toEqual(tabs);
  });
});

describe("coerceRoundTabsToHeatOnly", () => {
  it("count タブでも useAutoHeatFromMaxLanes:false を落とさない", () => {
    const tabs = [
      {
        id: "a",
        label: "r1",
        mode: "count" as const,
        heatCount: "3",
        heatSize: "",
        useAutoHeatFromMaxLanes: false as const,
      },
      {
        id: "b",
        label: "r2",
        mode: "count" as const,
        heatCount: "2",
        heatSize: "",
      },
    ];
    const out = coerceRoundTabsToHeatOnly(tabs, 24);
    expect(out[0]).toMatchObject({
      id: "a",
      mode: "count",
      heatCount: "3",
      heatSize: "",
      useAutoHeatFromMaxLanes: false,
    });
    expect(out[1]).toMatchObject({ id: "b", mode: "count", heatCount: "2", heatSize: "" });
  });
});

describe("buildRoundTabsForRoundCount", () => {
  it("先頭タブのヒート／レーン設定を上書きしない", () => {
    const prev = [
      {
        id: "a",
        label: "semi",
        mode: "count" as const,
        heatCount: "3",
        heatSize: "8",
      },
    ];
    const out = buildRoundTabsForRoundCount(1, prev);
    expect(out[0]).toMatchObject({ id: "a", mode: "count", heatCount: "3" });
  });

  it("新規に足すタブ（先頭含む）はヒートのみ（heatSize 空）", () => {
    const out = buildRoundTabsForRoundCount(2, []);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ mode: "count", heatCount: "1", heatSize: "" });
    expect(out[1]).toMatchObject({ mode: "count", heatCount: "1", heatSize: "" });
  });
});

describe("resolveHeatCountForSnapshotTransition", () => {
  it("HEAT→SEMI は roundTabs[1] のヒート数を人数に関係なく優先", () => {
    expect(
      resolveHeatCountForSnapshotTransition({
        setting: {
          roundTabs: [
            { id: "a", label: "r1", mode: "count", heatCount: "7", heatSize: "" },
            { id: "b", label: "x", mode: "count", heatCount: "4", heatSize: "8" },
          ],
        },
        participantTotal: 100,
        fromRound: "HEAT",
        toRound: "SEMI",
      })
    ).toBe(4);
  });

  it("roundTabs が無いとき progressionHeatCounts を使う", () => {
    expect(
      resolveHeatCountForSnapshotTransition({
        setting: { mode: "count", heatCount: "1", heatSize: "", progressionHeatCounts: [5, 1] },
        participantTotal: 80,
        fromRound: "HEAT",
        toRound: "SEMI",
      })
    ).toBe(5);
  });

  it("SEMI→FINAL は最終タブの設定を優先", () => {
    expect(
      resolveHeatCountForSnapshotTransition({
        setting: {
          roundTabs: [
            { id: "a", label: "r1", mode: "count", heatCount: "7", heatSize: "" },
            { id: "b", label: "q", mode: "count", heatCount: "4", heatSize: "8" },
            { id: "c", label: "f", mode: "count", heatCount: "1", heatSize: "8" },
          ],
        },
        participantTotal: 32,
        fromRound: "SEMI",
        toRound: "FINAL",
      })
    ).toBe(1);
  });

  it("HEAT→FINAL（2タブ）は最終タブのヒート数を使う", () => {
    expect(
      resolveHeatCountForSnapshotTransition({
        setting: {
          roundTabs: [
            { id: "a", label: "h", mode: "count", heatCount: "5", heatSize: "" },
            { id: "b", label: "f", mode: "count", heatCount: "2", heatSize: "" },
          ],
        },
        participantTotal: 40,
        fromRound: "HEAT",
        toRound: "FINAL",
      })
    ).toBe(2);
  });
});

describe("normalizeRoundTabs", () => {
  it("複数タブがすべて予選のとき、タブ数に応じた既定名に直す", () => {
    const tabs = normalizeRoundTabs({
      roundTabs: [
        { id: "1", label: "予選", mode: "count", heatCount: "1", heatSize: "" },
        { id: "2", label: "予選", mode: "count", heatCount: "1", heatSize: "8" },
        { id: "3", label: "予選", mode: "count", heatCount: "1", heatSize: "8" },
      ],
    });
    expect(tabs.map((t) => t.label)).toEqual(["quarter", "semi", "final"]);
  });

  it("すでに区別があるラベルは上書きしない", () => {
    const tabs = normalizeRoundTabs({
      roundTabs: [
        { id: "1", label: "予選", mode: "count", heatCount: "1", heatSize: "" },
        { id: "2", label: "準決勝A", mode: "count", heatCount: "2", heatSize: "8" },
      ],
    });
    expect(tabs.map((t) => t.label)).toEqual(["予選", "準決勝A"]);
  });

  it("maxLanesPerHeat を保持する", () => {
    const tabs = normalizeRoundTabs({
      roundTabs: [
        { id: "1", label: "h", mode: "count", heatCount: "2", heatSize: "", maxLanesPerHeat: 7 },
      ],
      mode: "count",
      heatCount: "2",
      heatSize: "",
    });
    expect(tabs[0]!.maxLanesPerHeat).toBe(7);
  });
});

describe("resolveTabMaxLanes", () => {
  it("タブ上書きを優先する", () => {
    expect(
      resolveTabMaxLanes(
        { id: "x", label: "q", mode: "count", heatCount: "1", heatSize: "", maxLanesPerHeat: 6 },
        10
      )
    ).toBe(6);
  });

  it("上書きが無ければ種目共通を使う", () => {
    expect(
      resolveTabMaxLanes({ id: "x", label: "q", mode: "count", heatCount: "1", heatSize: "" }, 10)
    ).toBe(10);
  });
});

describe("resolveMaxLanesForSnapshotTransition", () => {
  it("HEAT→FINAL（2タブ）は最終タブの maxLanes を使う", () => {
    expect(
      resolveMaxLanesForSnapshotTransition({
        setting: {
          roundTabs: [
            { id: "a", label: "h", mode: "count", heatCount: "5", heatSize: "" },
            { id: "b", label: "f", mode: "count", heatCount: "2", heatSize: "", maxLanesPerHeat: 8 },
          ],
        },
        eventDefaultLanes: 16,
        fromRound: "HEAT",
        toRound: "FINAL",
      })
    ).toBe(8);
  });
});
