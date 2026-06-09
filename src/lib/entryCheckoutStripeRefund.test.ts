import { describe, expect, it } from "vitest";
import { refundedEntryFeeYenFromCharge } from "./entryCheckoutStripeRefund";

describe("entryCheckoutStripeRefund", () => {
  it("full refund returns full entry fee", () => {
    expect(
      refundedEntryFeeYenFromCharge({
        amountRefundedYen: 8288,
        entryFeeYen: 8000,
        processingFeeYen: 288,
        fullyRefunded: true,
      })
    ).toBe(8000);
  });

  it("partial refund subtracts processing fee first", () => {
    expect(
      refundedEntryFeeYenFromCharge({
        amountRefundedYen: 5000,
        entryFeeYen: 8000,
        processingFeeYen: 288,
        fullyRefunded: false,
      })
    ).toBe(4712);
  });

  it("refund only covering processing fee returns 0 entry fee", () => {
    expect(
      refundedEntryFeeYenFromCharge({
        amountRefundedYen: 288,
        entryFeeYen: 8000,
        processingFeeYen: 288,
        fullyRefunded: false,
      })
    ).toBe(0);
  });
});
