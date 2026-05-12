import { describe, expect, it } from "vitest";
import {
  isSettledTeamEntryPaymentStatus,
  MUTABLE_TEAM_ENTRY_PAYMENT_STATUSES,
  SETTLED_TEAM_ENTRY_PAYMENT_STATUSES,
} from "@/lib/teamEntryPayments";

describe("team entry payment statuses", () => {
  it("treats Stripe-settled statuses as immutable billing records", () => {
    expect([...SETTLED_TEAM_ENTRY_PAYMENT_STATUSES]).toEqual([
      "SUCCEEDED",
      "REFUNDED",
      "DISPUTED",
    ]);
    expect(isSettledTeamEntryPaymentStatus("SUCCEEDED")).toBe(true);
    expect(isSettledTeamEntryPaymentStatus("REFUNDED")).toBe(true);
    expect(isSettledTeamEntryPaymentStatus("DISPUTED")).toBe(true);
  });

  it("keeps only unpaid/retryable statuses in the mutable set", () => {
    expect([...MUTABLE_TEAM_ENTRY_PAYMENT_STATUSES]).toEqual([
      "PENDING",
      "FAILED",
      "EXPIRED",
    ]);
    expect(isSettledTeamEntryPaymentStatus("PENDING")).toBe(false);
    expect(isSettledTeamEntryPaymentStatus("FAILED")).toBe(false);
    expect(isSettledTeamEntryPaymentStatus("EXPIRED")).toBe(false);
    expect(isSettledTeamEntryPaymentStatus(null)).toBe(false);
  });
});
