import { describe, expect, it } from "vitest";
import { parseStripeBalanceTransactionFeeYen } from "./stripeBalanceTransactionFee";

describe("parseStripeBalanceTransactionFeeYen", () => {
  it("reads fee from payload", () => {
    expect(parseStripeBalanceTransactionFeeYen({ stripeBalanceTransactionFeeYen: 328 })).toBe(
      328
    );
  });

  it("returns null when missing or invalid", () => {
    expect(parseStripeBalanceTransactionFeeYen(null)).toBeNull();
    expect(parseStripeBalanceTransactionFeeYen({})).toBeNull();
    expect(parseStripeBalanceTransactionFeeYen({ stripeBalanceTransactionFeeYen: -1 })).toBeNull();
  });
});
