import { describe, expect, it } from "vitest";
import { parseMaxLanesPerHeat, parseMaxLanesPerHeatOrNull } from "@/lib/maxLanesPerHeat";

describe("parseMaxLanesPerHeat", () => {
  it("1 以上の整数を受け付ける", () => {
    expect(parseMaxLanesPerHeat(1)).toBe(1);
    expect(parseMaxLanesPerHeat(32)).toBe(32);
    expect(parseMaxLanesPerHeat(33)).toBe(33);
    expect(parseMaxLanesPerHeat(64)).toBe(64);
    expect(parseMaxLanesPerHeat(100)).toBe(100);
    expect(parseMaxLanesPerHeat(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("小数は切り捨てる", () => {
    expect(parseMaxLanesPerHeat(8.9)).toBe(8);
  });

  it("0・負数・非整数・unsafe integer は undefined", () => {
    expect(parseMaxLanesPerHeat(0)).toBeUndefined();
    expect(parseMaxLanesPerHeat(-1)).toBeUndefined();
    expect(parseMaxLanesPerHeat(1.5)).toBe(1);
    expect(parseMaxLanesPerHeat(Number.MAX_SAFE_INTEGER + 1)).toBeUndefined();
    expect(parseMaxLanesPerHeat(NaN)).toBeUndefined();
    expect(parseMaxLanesPerHeat("8")).toBeUndefined();
    expect(parseMaxLanesPerHeat(null)).toBeUndefined();
  });
});

describe("parseMaxLanesPerHeatOrNull", () => {
  it("有効なら数値、無効なら null", () => {
    expect(parseMaxLanesPerHeatOrNull(50)).toBe(50);
    expect(parseMaxLanesPerHeatOrNull(0)).toBeNull();
  });
});
