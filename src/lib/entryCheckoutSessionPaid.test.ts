import { describe, expect, it } from "vitest";
import {
  competitionEntryEligibleForStartListWhere,
  competitionEntryPaidCheckoutWhere,
  isEntryCheckoutPaidForEligibility,
} from "./entryCheckoutSessionPaid";
import { isEntryEstablished } from "./entryFinalization";

describe("competitionEntryEligibleForStartListWhere", () => {
  it("無料・クラブ一括・Checkout 成立の OR を含む", () => {
    expect(competitionEntryEligibleForStartListWhere).toEqual({
      OR: [
        { totalFee: { lte: 0 } },
        { clubIndividualFeePaidAt: { not: null } },
        competitionEntryPaidCheckoutWhere,
      ],
    });
  });

  it("clubIndividualFeePaidAt のみで isEntryEstablished と整合する成立例", () => {
    const entry = {
      status: "SUBMITTED" as const,
      totalFee: 3000,
      checkoutSessions: [] as { status: "PENDING" }[],
      clubIndividualFeePaidAt: new Date(),
    };
    expect(isEntryEstablished(entry)).toBe(true);
    expect(entry.clubIndividualFeePaidAt).not.toBeNull();
    expect(isEntryCheckoutPaidForEligibility(entry.checkoutSessions[0]?.status)).toBe(false);
  });

  it("Checkout のみで成立する例は paidCheckout 条件を満たす", () => {
    const entry = {
      status: "SUBMITTED" as const,
      totalFee: 1000,
      checkoutSessions: [{ status: "COMPLETED" as const }],
      clubIndividualFeePaidAt: null,
    };
    expect(isEntryEstablished(entry)).toBe(true);
    expect(competitionEntryPaidCheckoutWhere.checkoutSessions).toEqual({
      some: { status: { in: ["COMPLETED", "DISPUTED"] } },
    });
  });
});
