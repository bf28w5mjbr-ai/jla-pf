import { afterEach, describe, expect, it } from "vitest";
import {
  getStripeProcessingFeeBpsFromEnv,
  stripeProcessingFeeSurchargeYenFromBps,
} from "./stripeProcessingFee";

describe("stripeProcessingFeeSurchargeYenFromBps", () => {
  it("returns 0 for non-positive base or bps", () => {
    expect(stripeProcessingFeeSurchargeYenFromBps(0, 360)).toBe(0);
    expect(stripeProcessingFeeSurchargeYenFromBps(1000, 0)).toBe(0);
    expect(stripeProcessingFeeSurchargeYenFromBps(-1, 360)).toBe(0);
  });

  it("uses ceil for 3.6% of typical entry fee", () => {
    expect(stripeProcessingFeeSurchargeYenFromBps(10_000, 360)).toBe(360);
    expect(stripeProcessingFeeSurchargeYenFromBps(1000, 360)).toBe(36);
    expect(stripeProcessingFeeSurchargeYenFromBps(1, 360)).toBe(1);
  });
});

describe("getStripeProcessingFeeBpsFromEnv", () => {
  const prev = process.env.STRIPE_PROCESSING_FEE_BPS;
  afterEach(() => {
    if (prev === undefined) delete process.env.STRIPE_PROCESSING_FEE_BPS;
    else process.env.STRIPE_PROCESSING_FEE_BPS = prev;
  });

  it("defaults to 360 when unset", () => {
    delete process.env.STRIPE_PROCESSING_FEE_BPS;
    expect(getStripeProcessingFeeBpsFromEnv()).toBe(360);
  });

  it("reads valid env", () => {
    process.env.STRIPE_PROCESSING_FEE_BPS = "250";
    expect(getStripeProcessingFeeBpsFromEnv()).toBe(250);
  });

  it("falls back on invalid", () => {
    process.env.STRIPE_PROCESSING_FEE_BPS = "nope";
    expect(getStripeProcessingFeeBpsFromEnv()).toBe(360);
    process.env.STRIPE_PROCESSING_FEE_BPS = "10001";
    expect(getStripeProcessingFeeBpsFromEnv()).toBe(360);
  });
});
