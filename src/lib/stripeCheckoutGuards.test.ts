import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isStripeCheckoutClientIpBlocked } from "./stripeCheckoutGuards";

describe("isStripeCheckoutClientIpBlocked", () => {
  beforeEach(() => {
    delete process.env.STRIPE_CHECKOUT_BLOCKED_IP_CIDRS;
  });

  afterEach(() => {
    delete process.env.STRIPE_CHECKOUT_BLOCKED_IP_CIDRS;
  });

  it("環境変数未設定ではブロックしない", () => {
    expect(isStripeCheckoutClientIpBlocked("203.0.113.5")).toBe(false);
    expect(isStripeCheckoutClientIpBlocked(null)).toBe(false);
  });

  it("IPv4 CIDR で一致する", () => {
    process.env.STRIPE_CHECKOUT_BLOCKED_IP_CIDRS = "10.0.0.0/8, 192.168.1.0/24";
    expect(isStripeCheckoutClientIpBlocked("10.5.3.1")).toBe(true);
    expect(isStripeCheckoutClientIpBlocked("192.168.1.255")).toBe(true);
    expect(isStripeCheckoutClientIpBlocked("192.168.2.1")).toBe(false);
  });

  it("IPv6 は完全一致のみ", () => {
    process.env.STRIPE_CHECKOUT_BLOCKED_IP_CIDRS = "2001:db8::1";
    expect(isStripeCheckoutClientIpBlocked("2001:db8::1")).toBe(true);
    expect(isStripeCheckoutClientIpBlocked("2001:db8::2")).toBe(false);
  });
});
