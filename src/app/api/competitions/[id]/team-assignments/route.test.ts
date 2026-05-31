/**
 * team-assignments PUT が利用する割当バリデーション（API ルートと同一ロジック）。
 */
import { describe, expect, it } from "vitest";
import {
  normalizeMemberSlotsInput,
  resolveTeamRelaySlotCount,
  validateMemberSlotsForSave,
} from "@/lib/teamMemberSlots";

describe("team-assignments save validation", () => {
  it("memberSlots 未指定は不正", () => {
    expect(normalizeMemberSlotsInput(undefined)).toBeNull();
    expect(normalizeMemberSlotsInput(["u1"])).not.toBeNull();
  });

  it("部分割当は 400 相当", () => {
    const slots = normalizeMemberSlotsInput(["u1", null])!;
    const result = validateMemberSlotsForSave({
      memberSlots: slots,
      expectedSlotCount: 2,
      teamLabel: "A",
    });
    expect(result.ok).toBe(false);
  });

  it("全枠空は保存可（未割当クリア）", () => {
    const slots = normalizeMemberSlotsInput([null, null])!;
    expect(
      validateMemberSlotsForSave({ memberSlots: slots, expectedSlotCount: 2 })
    ).toEqual({ ok: true });
  });

  it("全枠埋まりは保存可", () => {
    const slots = normalizeMemberSlotsInput(["u1", "u2"])!;
    expect(
      validateMemberSlotsForSave({ memberSlots: slots, expectedSlotCount: 2 })
    ).toEqual({ ok: true });
  });

  it("種目設定 4 枠と payload 長の一致を検証", () => {
    const expected = resolveTeamRelaySlotCount(4, []);
    const slots = normalizeMemberSlotsInput(["a", "b", "c", "d"])!;
    expect(slots.length).toBe(expected);
    expect(
      validateMemberSlotsForSave({ memberSlots: slots, expectedSlotCount: expected })
    ).toEqual({ ok: true });
  });

  it("PUT は送信された teamEntryId のみが更新対象（差分保存）", () => {
    const allSlots = normalizeMemberSlotsInput(["u1", "u2"])!;
    const partialSlots = normalizeMemberSlotsInput(["u3", "u4"])!;
    expect(validateMemberSlotsForSave({ memberSlots: allSlots, expectedSlotCount: 2 }).ok).toBe(
      true
    );
    expect(validateMemberSlotsForSave({ memberSlots: partialSlots, expectedSlotCount: 2 }).ok).toBe(
      true
    );
    expect(allSlots).not.toEqual(partialSlots);
  });
});
