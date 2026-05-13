import { describe, expect, it } from "vitest";
import {
  orderedLabelsForMergedEventIds,
  sortEventsByDisplayOrder,
  sortEventsForEntryExport,
} from "./competitionEntryExportOrdering";

describe("sortEventsByDisplayOrder", () => {
  it("displayOrder 昇順、同順位は id", () => {
    const out = sortEventsByDisplayOrder([
      { id: "b", displayOrder: 1, name: "B" },
      { id: "a", displayOrder: 0, name: "A" },
      { id: "c", displayOrder: 1, name: "C" },
    ]);
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});

describe("sortEventsForEntryExport", () => {
  it("年齢カテゴリの displayOrder が先で、その中で種目 displayOrder → 性別", () => {
    const cats = [
      { id: "c-u8", displayOrder: 0 },
      { id: "c-u10", displayOrder: 1 },
      { id: "c-u12", displayOrder: 2 },
    ];
    const events = [
      { id: "f10", ageCategoryId: "c-u10", displayOrder: 0, sex: "FEMALE" },
      { id: "f8", ageCategoryId: "c-u8", displayOrder: 2, sex: "FEMALE" },
      { id: "f12", ageCategoryId: "c-u12", displayOrder: 0, sex: "FEMALE" },
      { id: "m8", ageCategoryId: "c-u8", displayOrder: 0, sex: "MALE" },
    ];
    const out = sortEventsForEntryExport(events, cats);
    expect(out.map((e) => e.id)).toEqual(["m8", "f8", "f10", "f12"]);
  });

  it("同一カテゴリ・同一 displayOrder では男子が先", () => {
    const cats = [{ id: "c1", displayOrder: 0, name: "一般" }];
    const events = [
      { id: "f", ageCategoryId: "c1", displayOrder: 0, sex: "FEMALE" },
      { id: "m", ageCategoryId: "c1", displayOrder: 0, sex: "MALE" },
    ];
    const out = sortEventsForEntryExport(events, cats);
    expect(out.map((e) => e.id)).toEqual(["m", "f"]);
  });

  it("年齢カテゴリの displayOrder が同じときは name の数値順（U-8 の塊が U-10 より先）", () => {
    const cats = [
      { id: "id-u10", displayOrder: 0, name: "U-10" },
      { id: "id-u8", displayOrder: 0, name: "U-8" },
    ];
    const events = [
      { id: "e10", ageCategoryId: "id-u10", displayOrder: 0, sex: "FEMALE" },
      { id: "e8", ageCategoryId: "id-u8", displayOrder: 0, sex: "FEMALE" },
    ];
    const out = sortEventsForEntryExport(events, cats);
    expect(out.map((e) => e.id)).toEqual(["e8", "e10"]);
  });
});

describe("orderedLabelsForMergedEventIds", () => {
  it("programOrder の順でラベルを積み、entry の items 順は無視する", () => {
    const program = [
      { id: "e1" },
      { id: "e2" },
      { id: "e3" },
    ];
    const merged = new Set(["e3", "e1"]);
    const labels = orderedLabelsForMergedEventIds(program, merged, (id) => `L(${id})`);
    expect(labels).toEqual(["L(e1)", "L(e3)"]);
  });

  it("マスタに無い ID は末尾に辞書順", () => {
    const program = [{ id: "a" }];
    const merged = new Set(["a", "orphan-b", "orphan-a"]);
    const labels = orderedLabelsForMergedEventIds(program, merged, (id) => id);
    expect(labels).toEqual(["a", "orphan-a", "orphan-b"]);
  });
});
