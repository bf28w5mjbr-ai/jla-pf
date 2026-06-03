import { describe, expect, it } from "vitest";
import { shouldShowNextRoundSlSection } from "@/lib/startListNextRoundSlUi";

describe("shouldShowNextRoundSlSection", () => {
  it("loading 中は表示", () => {
    expect(shouldShowNextRoundSlSection(null, true)).toBe(true);
  });

  it("canGenerate なら表示", () => {
    expect(
      shouldShowNextRoundSlSection(
        { canGenerate: true, canRegenerate: false, canRescueRegenerate: false },
        false
      )
    ).toBe(true);
  });

  it("操作不可（toRound ブロック等）は非表示", () => {
    expect(
      shouldShowNextRoundSlSection(
        { canGenerate: false, canRegenerate: false, canRescueRegenerate: false },
        false
      )
    ).toBe(false);
  });

  it("status null かつ loading 終了は非表示", () => {
    expect(shouldShowNextRoundSlSection(null, false)).toBe(false);
  });
});
