import { describe, expect, it } from "vitest";
import {
  buildAllScheduleRowKeys,
  buildDefaultScheduleRowOrder,
  buildPublicScheduleSections,
  buildScheduleDayAreaPartition,
  buildScheduleRowPartition,
  deriveEventPrimaryTabIdFromPartition,
  deriveEventSortOrderFromRowOrder,
  findDayTabForRowKey,
  findTabIdForRowKey,
  formatScheduleRowKey,
  moveRowKeyInDayAreaPartition,
  moveRowKeyInPartition,
  orderScheduleRoundRows,
  parseScheduleRowKey,
  parseScheduleRowOrderByDayJson,
  reconcileScheduleRowOrder,
  flattenDayAreaPartitionKeys,
  validateClientDayAreaPartition,
  partitionsDeepEqual,
  tabScheduleRowOrderJsonEqual,
} from "@/lib/scheduleRowOrder";

describe("scheduleRowOrder", () => {
  it("parseScheduleRowKey round-trips", () => {
    const key = formatScheduleRowKey("evt1", 2);
    expect(parseScheduleRowKey(key)).toEqual({ eventId: "evt1", roundIndex: 2 });
  });

  it("buildDefaultScheduleRowOrder expands rounds per event", () => {
    const keys = buildDefaultScheduleRowOrder(
      [{ id: "a" }, { id: "b" }],
      { a: 2, b: 1 }
    );
    expect(keys).toEqual(["a:0", "a:1", "b:0"]);
  });

  it("reconcileScheduleRowOrder keeps saved order and inserts new rounds after event block", () => {
    const expected = ["a:0", "a:1", "b:0"];
    const saved = ["b:0", "a:0"];
    expect(reconcileScheduleRowOrder(saved, expected)).toEqual(["b:0", "a:0", "a:1"]);
  });

  it("reconcileScheduleRowOrder returns expected when saved is empty", () => {
    expect(reconcileScheduleRowOrder([], ["a:0", "b:0"])).toEqual(["a:0", "b:0"]);
  });

  it("orderScheduleRoundRows sorts by keys", () => {
    const rows = [
      { event: { id: "a" }, roundIndex: 1, roundLabel: "決勝" },
      { event: { id: "b" }, roundIndex: 0, roundLabel: "予選" },
      { event: { id: "a" }, roundIndex: 0, roundLabel: "予選" },
    ];
    const ordered = orderScheduleRoundRows(rows, ["b:0", "a:0", "a:1"]);
    expect(ordered.map((r) => `${r.event.id}:${r.roundIndex}`)).toEqual(["b:0", "a:0", "a:1"]);
  });

  it("deriveEventSortOrderFromRowOrder uses first appearance", () => {
    const map = deriveEventSortOrderFromRowOrder(["b:0", "a:0", "a:1"]);
    expect(map.get("b")).toBe(1);
    expect(map.get("a")).toBe(2);
  });

  it("buildScheduleRowPartition dedupes keys across tabs (first tab wins)", () => {
    const partition = buildScheduleRowPartition({
      tabs: [
        { id: "t1", scheduleRowOrder: ["a:0"] },
        { id: "t2", scheduleRowOrder: ["a:0", "a:1"] },
      ],
      events: [
        { id: "a", scheduleTabId: "t1" },
      ],
      roundCountByEventId: { a: 2 },
    });
    expect(partition.t1).toEqual(["a:0"]);
    expect(partition.t2).toEqual(["a:1"]);
  });

  it("buildScheduleRowPartition assigns missing keys to scheduleTabId default", () => {
    const partition = buildScheduleRowPartition({
      tabs: [{ id: "t1" }, { id: "t2" }],
      events: [{ id: "a", scheduleTabId: "t2" }],
      roundCountByEventId: { a: 2 },
    });
    expect(partition.t1).toEqual([]);
    expect(partition.t2).toEqual(["a:0", "a:1"]);
  });

  it("buildScheduleRowPartition puts new round after sibling in same tab", () => {
    const partition = buildScheduleRowPartition({
      tabs: [
        { id: "t1", scheduleRowOrder: ["a:0"] },
        { id: "t2", scheduleRowOrder: ["a:1"] },
      ],
      events: [{ id: "a", scheduleTabId: "t1" }],
      roundCountByEventId: { a: 2 },
    });
    expect(findTabIdForRowKey("a:0", partition)).toBe("t1");
    expect(findTabIdForRowKey("a:1", partition)).toBe("t2");
  });

  it("moveRowKeyInPartition moves row between tabs", () => {
    const partition = {
      t1: ["a:0", "b:0"],
      t2: ["a:1"],
    };
    const next = moveRowKeyInPartition(partition, "a:1", "t1", 1);
    expect(next?.t1).toEqual(["a:0", "a:1", "b:0"]);
    expect(next?.t2).toEqual([]);
  });

  it("buildAllScheduleRowKeys equals buildDefaultScheduleRowOrder", () => {
    const events = [{ id: "x" }];
    const rc = { x: 3 };
    expect(buildAllScheduleRowKeys(events, rc)).toEqual(buildDefaultScheduleRowOrder(events, rc));
  });

  it("parseScheduleRowOrderByDayJson normalizes legacy string[]", () => {
    expect(parseScheduleRowOrderByDayJson(["a:0", "b:0"], "2026-05-01")).toEqual({
      "2026-05-01": ["a:0", "b:0"],
    });
  });

  it("buildScheduleDayAreaPartition dedupes keys across tabs and days", () => {
    const partition = buildScheduleDayAreaPartition({
      tabs: [
        { id: "t1", scheduleRowOrder: { "2026-05-01": ["a:0"] } },
        { id: "t2", scheduleRowOrder: { "2026-05-01": ["a:0", "a:1"], "2026-05-02": ["b:0"] } },
      ],
      events: [{ id: "a", scheduleTabId: "t1" }, { id: "b", scheduleTabId: "t2" }],
      roundCountByEventId: { a: 2, b: 1 },
      competitionDayKeys: ["2026-05-01", "2026-05-02"],
      defaultDayKey: "2026-05-01",
    });
    expect(partition["2026-05-01"]!.t1).toEqual(["a:0"]);
    expect(partition["2026-05-01"]!.t2).toEqual(["a:1"]);
    expect(partition["2026-05-02"]!.t2).toEqual(["b:0"]);
  });

  it("buildScheduleDayAreaPartition assigns missing keys to defaultDayKey", () => {
    const partition = buildScheduleDayAreaPartition({
      tabs: [{ id: "t1" }],
      events: [{ id: "a", scheduleTabId: "t1" }],
      roundCountByEventId: { a: 1 },
      competitionDayKeys: ["2026-05-01"],
      defaultDayKey: "2026-05-01",
    });
    expect(partition["2026-05-01"]!.t1).toEqual(["a:0"]);
  });

  it("parseScheduleRowOrderByDayJson migrates __unassigned__ to defaultDayKey", () => {
    const parsed = parseScheduleRowOrderByDayJson(
      {
        "2026-05-01": ["a:0"],
        __unassigned__: ["b:0"],
      },
      "2026-05-01"
    );
    expect(parsed).toEqual({ "2026-05-01": ["a:0", "b:0"] });
  });

  it("buildScheduleDayAreaPartition migrates legacy __unassigned__ bucket to first day", () => {
    const partition = buildScheduleDayAreaPartition({
      tabs: [
        {
          id: "t1",
          scheduleRowOrder: {
            "2026-05-02": ["b:0"],
            __unassigned__: ["c:0"],
          },
        },
      ],
      events: [
        { id: "b", scheduleTabId: "t1" },
        { id: "c", scheduleTabId: "t1" },
      ],
      roundCountByEventId: { b: 1, c: 1 },
      competitionDayKeys: ["2026-05-01", "2026-05-02"],
      defaultDayKey: "2026-05-01",
    });
    expect(partition["2026-05-01"]!.t1).toEqual(["c:0"]);
    expect(partition["2026-05-02"]!.t1).toEqual(["b:0"]);
  });

  it("moveRowKeyInDayAreaPartition moves row between days and tabs", () => {
    const partition = buildScheduleDayAreaPartition({
      tabs: [
        { id: "t1", scheduleRowOrder: { "2026-05-01": ["a:0"], "2026-05-02": ["a:1"] } },
      ],
      events: [{ id: "a", scheduleTabId: "t1" }],
      roundCountByEventId: { a: 2 },
      competitionDayKeys: ["2026-05-01", "2026-05-02"],
      defaultDayKey: "2026-05-01",
    });
    const next = moveRowKeyInDayAreaPartition(
      partition,
      "a:1",
      "2026-05-01",
      "t1",
      ["t1"],
      1
    );
    expect(next?.["2026-05-01"]!.t1).toEqual(["a:0", "a:1"]);
    expect(next?.["2026-05-02"]!.t1).toEqual([]);
    expect(findDayTabForRowKey("a:1", next!)).toEqual({ dayKey: "2026-05-01", tabId: "t1" });
  });

  it("buildPublicScheduleSections orders by competition days", () => {
    const partition = buildScheduleDayAreaPartition({
      tabs: [
        {
          id: "t1",
          scheduleRowOrder: {
            "2026-05-01": ["a:0"],
            "2026-05-02": ["b:0"],
          },
        },
      ],
      events: [
        { id: "a", scheduleTabId: "t1" },
        { id: "b", scheduleTabId: "t1" },
      ],
      roundCountByEventId: { a: 1, b: 1 },
      competitionDayKeys: ["2026-05-01", "2026-05-02"],
      defaultDayKey: "2026-05-01",
    });
    const sections = buildPublicScheduleSections({
      partition,
      competitionDays: [
        { key: "2026-05-01", label: "5/1（木）" },
        { key: "2026-05-02", label: "5/2（金）" },
      ],
      tabs: [{ id: "t1", name: "メイン", displayOrder: 0 }],
    });
    expect(sections).toHaveLength(2);
    expect(sections[0]!.areas[0]!.rowKeys).toEqual(["a:0"]);
    expect(sections[1]!.areas[0]!.rowKeys).toEqual(["b:0"]);
  });

  describe("validateClientDayAreaPartition", () => {
    const tabIds = ["t1", "t2"];
    const competitionDayKeys = ["2026-05-01", "2026-05-02"];
    const expectedKeys = buildAllScheduleRowKeys(
      [{ id: "a" }, { id: "b" }],
      { a: 1, b: 1 }
    );
    const validPartition = {
      "2026-05-01": { t1: ["a:0"] },
      "2026-05-02": { t2: ["b:0"] },
    };

    it("accepts valid partition", () => {
      const result = validateClientDayAreaPartition(validPartition, {
        tabIds,
        competitionDayKeys,
        expectedKeys,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(flattenDayAreaPartitionKeys(result.partition).sort()).toEqual(
          expectedKeys.sort()
        );
      }
    });

    it("rejects unknown dayKey", () => {
      const result = validateClientDayAreaPartition(
        { "2026-05-03": { t1: ["a:0"] }, "2026-05-02": { t2: ["b:0"] } },
        { tabIds, competitionDayKeys, expectedKeys }
      );
      expect(result).toEqual({ ok: false, message: "不明な開催日です: 2026-05-03" });
    });

    it("rejects unknown tabId", () => {
      const result = validateClientDayAreaPartition(
        { "2026-05-01": { tX: ["a:0"] }, "2026-05-02": { t2: ["b:0"] } },
        { tabIds, competitionDayKeys, expectedKeys }
      );
      expect(result).toEqual({ ok: false, message: "不明なエリアです: tX" });
    });

    it("rejects duplicate keys", () => {
      const result = validateClientDayAreaPartition(
        {
          "2026-05-01": { t1: ["a:0", "b:0"] },
          "2026-05-02": { t2: ["b:0"] },
        },
        { tabIds, competitionDayKeys, expectedKeys }
      );
      expect(result).toEqual({
        ok: false,
        message: "行キーが重複しています: b:0",
      });
    });

    it("rejects missing keys", () => {
      const result = validateClientDayAreaPartition(
        { "2026-05-01": { t1: ["a:0"] } },
        { tabIds, competitionDayKeys, expectedKeys }
      );
      expect(result).toEqual({
        ok: false,
        message: "行キーの集合が大会の種目×ラウンドと一致しません",
      });
    });
  });

  describe("deriveEventPrimaryTabIdFromPartition", () => {
    const partition = {
      "2026-05-01": { t1: ["a:0", "a:1"], t2: ["b:0"] },
      "2026-05-02": { t2: ["c:0"] },
    };

    it("returns tab of round 0 when present", () => {
      expect(deriveEventPrimaryTabIdFromPartition(partition, "a", ["t1", "t2"])).toBe(
        "t1"
      );
      expect(deriveEventPrimaryTabIdFromPartition(partition, "b", ["t1", "t2"])).toBe(
        "t2"
      );
    });

    it("falls back to first found round when round 0 missing", () => {
      expect(deriveEventPrimaryTabIdFromPartition(partition, "c", ["t1", "t2"])).toBe(
        "t2"
      );
    });

    it("returns null when event not in partition", () => {
      expect(deriveEventPrimaryTabIdFromPartition(partition, "z", ["t1", "t2"])).toBe(
        null
      );
    });
  });

  describe("partitionsDeepEqual", () => {
    it("returns true for equivalent partitions", () => {
      const a = {
        "2026-05-02": { t2: ["b:0"] },
        "2026-05-01": { t1: ["a:0"] },
      };
      const b = {
        "2026-05-01": { t1: ["a:0"] },
        "2026-05-02": { t2: ["b:0"] },
      };
      expect(partitionsDeepEqual(a, b)).toBe(true);
    });

    it("returns false when keys differ", () => {
      const a = { "2026-05-01": { t1: ["a:0"] } };
      const b = { "2026-05-01": { t1: ["b:0"] } };
      expect(partitionsDeepEqual(a, b)).toBe(false);
    });
  });

  describe("tabScheduleRowOrderJsonEqual", () => {
    it("compares by-day JSON", () => {
      expect(
        tabScheduleRowOrderJsonEqual(
          { "2026-05-01": ["a:0"] },
          { "2026-05-01": ["a:0"] }
        )
      ).toBe(true);
      expect(
        tabScheduleRowOrderJsonEqual(
          { "2026-05-01": ["a:0"] },
          { "2026-05-01": ["b:0"] }
        )
      ).toBe(false);
    });
  });
});
