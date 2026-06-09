import { afterEach, describe, expect, it } from "vitest";
import {
  getStripeProcessingFeeBpsFromEnv,
  stripeProcessingFeeSurchargeYenFromBps,
} from "./stripeProcessingFee";

describe("stripeProcessingFeeSurchargeYenFromBps", () => {
  it("returns 0 for non-positive base or bps", () => {
    expect(stripeProcessingFeeSurchargeYenFromBps(0, 400)).toBe(0);
    expect(stripeProcessingFeeSurchargeYenFromBps(1000, 0)).toBe(0);
    expect(stripeProcessingFeeSurchargeYenFromBps(-1, 400)).toBe(0);
  });

  it("uses gross-up ceil for typical entry fee at 4.0%", () => {
    expect(stripeProcessingFeeSurchargeYenFromBps(10_000, 400)).toBe(417);
    expect(stripeProcessingFeeSurchargeYenFromBps(1000, 400)).toBe(42);
    expect(stripeProcessingFeeSurchargeYenFromBps(1, 400)).toBe(1);
  });

  it("exceeds flat-rate surcharge and typical Stripe balance transaction fee", () => {
    const flatRate = Math.ceil((8_000 * 400) / 10000);
    const grossUp = stripeProcessingFeeSurchargeYenFromBps(8_000, 400);
    expect(grossUp).toBe(334);
    expect(grossUp).toBeGreaterThan(flatRate);
    expect(grossUp).toBeGreaterThan(328);
  });

  it("returns baseYen when bps is 10000 or more", () => {
    expect(stripeProcessingFeeSurchargeYenFromBps(5000, 10000)).toBe(5000);
  });
});

describe("getStripeProcessingFeeBpsFromEnv", () => {
  const prev = process.env.STRIPE_PROCESSING_FEE_BPS;
  afterEach(() => {
    if (prev === undefined) delete process.env.STRIPE_PROCESSING_FEE_BPS;
    else process.env.STRIPE_PROCESSING_FEE_BPS = prev;
  });

  it("defaults to 400 when unset", () => {
    delete process.env.STRIPE_PROCESSING_FEE_BPS;
    expect(getStripeProcessingFeeBpsFromEnv()).toBe(400);
  });

  it("reads valid env", () => {
    process.env.STRIPE_PROCESSING_FEE_BPS = "250";
    expect(getStripeProcessingFeeBpsFromEnv()).toBe(250);
  });

  it("falls back on invalid", () => {
    process.env.STRIPE_PROCESSING_FEE_BPS = "nope";
    expect(getStripeProcessingFeeBpsFromEnv()).toBe(400);
    process.env.STRIPE_PROCESSING_FEE_BPS = "10000";
    expect(getStripeProcessingFeeBpsFromEnv()).toBe(400);
    process.env.STRIPE_PROCESSING_FEE_BPS = "10001";
    expect(getStripeProcessingFeeBpsFromEnv()).toBe(400);
  });
});
