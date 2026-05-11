import { describe, expect, it } from "vitest";
import { resolveClubIndividualEntryBillingTiming } from "./clubIndividualEntryBillingTiming";

describe("resolveClubIndividualEntryBillingTiming", () => {
  it("always returns INSTANT_PREPAID regardless of entryFee shape", () => {
    expect(resolveClubIndividualEntryBillingTiming(null)).toBe("INSTANT_PREPAID");
    expect(resolveClubIndividualEntryBillingTiming(undefined)).toBe("INSTANT_PREPAID");
    expect(resolveClubIndividualEntryBillingTiming(5000)).toBe("INSTANT_PREPAID");
    expect(resolveClubIndividualEntryBillingTiming(0)).toBe("INSTANT_PREPAID");
    expect(
      resolveClubIndividualEntryBillingTiming({
        clubIndividualBilling: "post_close",
        individualEntryFee: 3000,
      })
    ).toBe("INSTANT_PREPAID");
    expect(
      resolveClubIndividualEntryBillingTiming({
        clubIndividualBilling: "instant",
        individualEntryFee: 3000,
      })
    ).toBe("INSTANT_PREPAID");
    expect(
      resolveClubIndividualEntryBillingTiming({
        individualEntryFee: 2000,
        teamEntryFeePerTeam: 5000,
        individualEntryFeePerEvent: true,
      })
    ).toBe("INSTANT_PREPAID");
    expect(
      resolveClubIndividualEntryBillingTiming({
        individualEntryFee: 2000,
        teamEntryFeePerTeam: 5000,
      })
    ).toBe("INSTANT_PREPAID");
    expect(
      resolveClubIndividualEntryBillingTiming({
        ageFeeTiers: [
          { minAge: 0, maxAge: 17, individualEntryFee: 1000, teamEntryFeePerTeam: 3000 },
          { minAge: 18, maxAge: null, individualEntryFee: 2000, teamEntryFeePerTeam: 5000 },
        ],
      })
    ).toBe("INSTANT_PREPAID");
  });
});
