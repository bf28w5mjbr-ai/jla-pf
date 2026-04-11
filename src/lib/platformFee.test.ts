import { afterEach, describe, expect, it, vi } from "vitest";
import { applicationFeeAmountYen, getPlatformFeeBps } from "./platformFee";

describe("platformFee", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getPlatformFeeBps defaults to 800", () => {
    delete process.env.STRIPE_PLATFORM_FEE_BPS;
    expect(getPlatformFeeBps()).toBe(800);
  });

  it("applicationFeeAmountYen uses 8% rounding", () => {
    expect(applicationFeeAmountYen(10_000, 800)).toBe(800);
    expect(applicationFeeAmountYen(1000, 800)).toBe(80);
  });

  it("applicationFeeAmountYen leaves at least 1 yen to connected when tiny total", () => {
    expect(applicationFeeAmountYen(2, 800)).toBe(0);
    expect(applicationFeeAmountYen(1, 800)).toBe(0);
  });
});
