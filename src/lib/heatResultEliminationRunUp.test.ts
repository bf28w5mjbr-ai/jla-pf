import { describe, expect, it } from "vitest";
import {
  canApplyRunUp,
  eliminationSlots,
  isHeatResultReadyForConfirm,
  validateHeatResultConfirmInTransaction,
} from "@/lib/heatResultEliminationRunUp";

describe("eliminationSlots", () => {
  it("8人中4アップなら脱落4・ランアップ4", () => {
    expect(eliminationSlots({ called: 8, quota: 4 })).toEqual({
      eliminationTarget: 4,
      runUpTarget: 4,
    });
  });
});

describe("canApplyRunUp", () => {
  it("脱落4済み・ランアップ0なら適用可", () => {
    expect(
      canApplyRunUp({
        called: 8,
        quota: 4,
        rankedCount: 4,
        runUpCount: 0,
        resultDraftCount: 0,
      })
    ).toBe(true);
  });

  it("脱落不足なら不可", () => {
    expect(
      canApplyRunUp({
        called: 8,
        quota: 4,
        rankedCount: 3,
        runUpCount: 0,
        resultDraftCount: 0,
      })
    ).toBe(false);
  });
});

describe("isHeatResultReadyForConfirm", () => {
  it("脱落式: 脱落4+ランアップ4で完了", () => {
    expect(
      isHeatResultReadyForConfirm({
        called: 8,
        quota: 4,
        rankedCount: 4,
        runUpCount: 4,
        resultDraftCount: 0,
        usesElimination: true,
      })
    ).toBe(true);
  });

  it("通常: 全員着順で完了", () => {
    expect(
      isHeatResultReadyForConfirm({
        called: 5,
        quota: 2,
        rankedCount: 5,
        runUpCount: 0,
        resultDraftCount: 0,
        usesElimination: false,
      })
    ).toBe(true);
  });
});

describe("validateHeatResultConfirmInTransaction", () => {
  it("脱落型 OK", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => ({
        rank: 8 - i,
        advanceWithoutRank: false,
      })),
      ...Array.from({ length: 4 }, () => ({
        rank: null as number | null,
        advanceWithoutRank: true,
      })),
    ];
    expect(
      validateHeatResultConfirmInTransaction({
        calledInHeat: 8,
        quota: 4,
        rows,
      })
    ).toEqual({ ok: true });
  });

  it("ランアップ不足 NG", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => ({
        rank: 8 - i,
        advanceWithoutRank: false,
      })),
    ];
    expect(
      validateHeatResultConfirmInTransaction({
        calledInHeat: 8,
        quota: 4,
        rows,
      })
    ).toEqual({ ok: false, code: "HEAT_RESULT_INCOMPLETE_RUN_UP" });
  });
});
