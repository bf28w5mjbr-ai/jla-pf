import { describe, expect, it } from "vitest";
import {
  TEAM_ENTRY_APPLICANT_ROLE,
  buildMemberSlotsFromDb,
  filterAssignableTeamEntryMembers,
  findPartialAssignmentTeamLabels,
  normalizeMemberSlotsInput,
  parseRelayPositionNames,
  resolveTeamRelaySlotCount,
  validateMemberSlotsForSave,
} from "./teamMemberSlots";

describe("parseRelayPositionNames", () => {
  it("文字列配列を trim して返す", () => {
    expect(parseRelayPositionNames([" 先頭 ", "2番"])).toEqual(["先頭", "2番"]);
  });

  it("不正な値は空配列", () => {
    expect(parseRelayPositionNames(null)).toEqual([]);
    expect(parseRelayPositionNames("x")).toEqual([]);
  });
});

describe("resolveTeamRelaySlotCount", () => {
  it("種目設定があればそれを優先", () => {
    expect(resolveTeamRelaySlotCount(4, [{ order: 1 }])).toBe(4);
  });

  it("未設定時は assignable メンバー数から推定", () => {
    expect(
      resolveTeamRelaySlotCount(null, [
        { userId: "u1", order: 1, role: "ATHLETE" },
        { userId: "u2", order: 2, role: "ATHLETE" },
      ])
    ).toBe(2);
  });

  it("申請者は枠数推定に含めない", () => {
    expect(
      resolveTeamRelaySlotCount(null, [
        { userId: "u1", order: 1, role: TEAM_ENTRY_APPLICANT_ROLE },
      ])
    ).toBe(1);
  });
});

describe("buildMemberSlotsFromDb", () => {
  it("order 順にスロットへ配置", () => {
    expect(
      buildMemberSlotsFromDb(
        [
          { userId: "u2", order: 2 },
          { userId: "u1", order: 1 },
        ],
        3
      )
    ).toEqual(["u1", "u2", null]);
  });

  it("申請者はスロットに含めない", () => {
    expect(
      buildMemberSlotsFromDb(
        [
          { userId: "applicant", order: 1, role: TEAM_ENTRY_APPLICANT_ROLE },
          { userId: "u1", order: 1, role: "ATHLETE" },
        ],
        2
      )
    ).toEqual(["u1", null]);
  });
});

describe("filterAssignableTeamEntryMembers", () => {
  it("申請者を除外", () => {
    const rows = [
      { userId: "a", role: TEAM_ENTRY_APPLICANT_ROLE },
      { userId: "b", role: "ATHLETE" },
    ];
    expect(filterAssignableTeamEntryMembers(rows)).toEqual([{ userId: "b", role: "ATHLETE" }]);
  });
});

describe("validateMemberSlotsForSave", () => {
  it("全枠空は OK", () => {
    expect(
      validateMemberSlotsForSave({ memberSlots: [null, null], expectedSlotCount: 2 })
    ).toEqual({ ok: true });
  });

  it("全枠埋まりは OK", () => {
    expect(
      validateMemberSlotsForSave({
        memberSlots: ["u1", "u2"],
        expectedSlotCount: 2,
      })
    ).toEqual({ ok: true });
  });

  it("部分割当は NG", () => {
    const result = validateMemberSlotsForSave({
      memberSlots: ["u1", null],
      expectedSlotCount: 2,
      teamLabel: "Aチーム",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Aチーム");
      expect(result.message).toContain("全ポジション");
    }
  });

  it("枠数不一致は NG", () => {
    const result = validateMemberSlotsForSave({
      memberSlots: ["u1"],
      expectedSlotCount: 3,
    });
    expect(result.ok).toBe(false);
  });

  it("同一メンバー重複は NG", () => {
    const result = validateMemberSlotsForSave({
      memberSlots: ["u1", "u1"],
      expectedSlotCount: 2,
    });
    expect(result.ok).toBe(false);
  });
});

describe("normalizeMemberSlotsInput", () => {
  it("空文字は null に正規化", () => {
    expect(normalizeMemberSlotsInput(["u1", "", null])).toEqual(["u1", null, null]);
  });

  it("配列以外は null", () => {
    expect(normalizeMemberSlotsInput("x")).toBeNull();
  });
});

describe("findPartialAssignmentTeamLabels", () => {
  it("部分割当チーム名を返す", () => {
    expect(
      findPartialAssignmentTeamLabels([
        { teamName: "A", memberSlots: ["u1", null] },
        { teamName: "B", memberSlots: [null, null] },
        { teamName: "C", memberSlots: ["u2", "u3"] },
      ])
    ).toEqual(["A"]);
  });
});
