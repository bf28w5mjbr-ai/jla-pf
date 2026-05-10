import { describe, expect, it } from "vitest";
import { applyInstantPrepaidWaiverToBaseFee } from "./clubPrepaidIndividualSlotRetroactiveReconcile";

describe("applyInstantPrepaidWaiverToBaseFee", () => {
  const unitsOk = { individualUnit: 3000, ageTierMissing: false };

  it("offsets one individual unit under INSTANT_PREPAID when items exist and snapshot has no team rows", () => {
    expect(
      applyInstantPrepaidWaiverToBaseFee(9000, "INSTANT_PREPAID", 3, 0, unitsOk)
    ).toEqual({ totalFee: 6000, appliedWaiver: true });
    expect(
      applyInstantPrepaidWaiverToBaseFee(3000, "INSTANT_PREPAID", 1, 0, unitsOk)
    ).toEqual({ totalFee: 0, appliedWaiver: true });
  });

  it("does not waive under POST_CLOSE_INVOICE", () => {
    expect(
      applyInstantPrepaidWaiverToBaseFee(9000, "POST_CLOSE_INVOICE", 3, 0, unitsOk)
    ).toEqual({ totalFee: 9000, appliedWaiver: false });
  });

  it("does not waive without individual items", () => {
    expect(
      applyInstantPrepaidWaiverToBaseFee(3000, "INSTANT_PREPAID", 0, 0, unitsOk)
    ).toEqual({ totalFee: 3000, appliedWaiver: false });
  });

  it("does not waive when snapshot has team-entry rows", () => {
    expect(
      applyInstantPrepaidWaiverToBaseFee(3000, "INSTANT_PREPAID", 1, 2, unitsOk)
    ).toEqual({ totalFee: 3000, appliedWaiver: false });
  });

  it("does not waive when fee tier cannot be resolved (POST parity)", () => {
    expect(
      applyInstantPrepaidWaiverToBaseFee(9000, "INSTANT_PREPAID", 2, 0, {
        individualUnit: 3000,
        ageTierMissing: true,
      })
    ).toEqual({ totalFee: 9000, appliedWaiver: false });
  });

  it("returns unchanged for zero base fee", () => {
    expect(
      applyInstantPrepaidWaiverToBaseFee(0, "INSTANT_PREPAID", 1, 0, unitsOk)
    ).toEqual({ totalFee: 0, appliedWaiver: false });
  });
});
