import { describe, expect, it } from "vitest";
import {
  normalizeTeamNamesForEvent,
  syncDraftListTeamCountForEvent,
} from "@/lib/teamEntryDraftNormalize";

describe("syncDraftListTeamCountForEvent", () => {
  const base = "Club";

  it("0組から2組へ増やすと接尾辞 A・B が付く（複数組はベースのみにしない）", () => {
    const list: { id: string; eventId: string; teamName: string }[] = [];
    const ev = "e1";
    const out = syncDraftListTeamCountForEvent(list, ev, 2, base);
    expect(out.filter((r) => r.eventId === ev)).toHaveLength(2);
    expect(out.map((r) => r.teamName).sort()).toEqual(["Club A", "Club B"]);
  });

  it("2組から0組へ減らすとその種目の行がなくなる", () => {
    const ev = "e1";
    const list = [
      { id: "1", eventId: ev, teamName: "Club" },
      { id: "2", eventId: ev, teamName: "Club A" },
      { id: "3", eventId: "other", teamName: "X" },
    ];
    const out = syncDraftListTeamCountForEvent(list, ev, 0, base);
    expect(out.filter((r) => r.eventId === ev)).toHaveLength(0);
    expect(out.find((r) => r.id === "3")).toEqual({ id: "3", eventId: "other", teamName: "X" });
  });

  it("件数が同じなら同一参照を返す", () => {
    const ev = "e1";
    const list = [{ id: "1", eventId: ev, teamName: "Club" }];
    const out = syncDraftListTeamCountForEvent(list, ev, 1, base);
    expect(out).toBe(list);
  });
});

describe("normalizeTeamNamesForEvent", () => {
  it("3組で A B C が付く", () => {
    const base = "Tokyo";
    const rows = [
      { id: "a", eventId: "e", teamName: "" },
      { id: "b", eventId: "e", teamName: "" },
      { id: "c", eventId: "e", teamName: "" },
    ];
    const out = normalizeTeamNamesForEvent(rows, "e", base);
    expect(out.map((r) => r.teamName)).toEqual(["Tokyo A", "Tokyo B", "Tokyo C"]);
  });
});
