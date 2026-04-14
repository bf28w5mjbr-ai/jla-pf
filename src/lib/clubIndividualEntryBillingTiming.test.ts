import { describe, expect, it } from "vitest";
import {
  resolveClubIndividualEntryBillingTiming,
  type ClubIndividualEntryBillingTiming,
} from "./clubIndividualEntryBillingTiming";

function expectTiming(entryFee: unknown, expected: ClubIndividualEntryBillingTiming) {
  expect(resolveClubIndividualEntryBillingTiming(entryFee)).toBe(expected);
}

describe("resolveClubIndividualEntryBillingTiming", () => {
  it("treats null and undefined as INSTANT_PREPAID", () => {
    expectTiming(null, "INSTANT_PREPAID");
    expectTiming(undefined, "INSTANT_PREPAID");
  });

  it("uses POST_CLOSE for legacy numeric entryFee", () => {
    expectTiming(5000, "POST_CLOSE_INVOICE");
    expectTiming(0, "POST_CLOSE_INVOICE");
  });

  it("respects clubIndividualBilling override", () => {
    expectTiming({ clubIndividualBilling: "post_close", individualEntryFee: 3000 }, "POST_CLOSE_INVOICE");
    expectTiming({ clubIndividualBilling: "instant", individualEntryFee: 3000 }, "INSTANT_PREPAID");
  });

  it("uses POST_CLOSE when individualEntryFeePerEvent is true", () => {
    expectTiming(
      {
        individualEntryFee: 2000,
        teamEntryFeePerTeam: 5000,
        individualEntryFeePerEvent: true,
      },
      "POST_CLOSE_INVOICE"
    );
  });

  it("uses INSTANT_PREPAID for flat object fees", () => {
    expectTiming(
      { individualEntryFee: 2000, teamEntryFeePerTeam: 5000 },
      "INSTANT_PREPAID"
    );
    expectTiming({ baseFee: 1500, teamEntryFeePerTeam: 4000 }, "INSTANT_PREPAID");
  });

  it("uses INSTANT_PREPAID for tiered fee objects without per-event flag", () => {
    expectTiming(
      {
        ageFeeTiers: [
          { minAge: 0, maxAge: 17, individualEntryFee: 1000, teamEntryFeePerTeam: 3000 },
          { minAge: 18, maxAge: null, individualEntryFee: 2000, teamEntryFeePerTeam: 5000 },
        ],
      },
      "INSTANT_PREPAID"
    );
  });
});
