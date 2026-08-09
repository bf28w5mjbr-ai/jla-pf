import { describe, expect, it } from "vitest";
import {
  isMutableTeamEntryPaymentStatus,
  isTerminalTeamEntryPaymentStatus,
  TEAM_ENTRY_PAYMENT_MUTABLE_STATUSES,
  TEAM_ENTRY_PAYMENT_TERMINAL_STATUSES,
} from "./teamEntryPayments";

describe("team entry payment status guards", () => {
  it("treats only unpaid/retryable statuses as mutable", () => {
    expect(TEAM_ENTRY_PAYMENT_MUTABLE_STATUSES).toEqual(["PENDING", "FAILED", "EXPIRED"]);
    expect(isMutableTeamEntryPaymentStatus("PENDING")).toBe(true);
    expect(isMutableTeamEntryPaymentStatus("FAILED")).toBe(true);
    expect(isMutableTeamEntryPaymentStatus("EXPIRED")).toBe(true);

    expect(isMutableTeamEntryPaymentStatus("SUCCEEDED")).toBe(false);
    expect(isMutableTeamEntryPaymentStatus("REFUNDED")).toBe(false);
    expect(isMutableTeamEntryPaymentStatus("DISPUTED")).toBe(false);
    expect(isMutableTeamEntryPaymentStatus(null)).toBe(false);
  });

  it("treats paid/accounting statuses as terminal", () => {
    expect(TEAM_ENTRY_PAYMENT_TERMINAL_STATUSES).toEqual([
      "SUCCEEDED",
      "REFUNDED",
      "DISPUTED",
    ]);
    expect(isTerminalTeamEntryPaymentStatus("SUCCEEDED")).toBe(true);
    expect(isTerminalTeamEntryPaymentStatus("REFUNDED")).toBe(true);
    expect(isTerminalTeamEntryPaymentStatus("DISPUTED")).toBe(true);

    expect(isTerminalTeamEntryPaymentStatus("PENDING")).toBe(false);
    expect(isTerminalTeamEntryPaymentStatus("FAILED")).toBe(false);
    expect(isTerminalTeamEntryPaymentStatus("EXPIRED")).toBe(false);
    expect(isTerminalTeamEntryPaymentStatus(undefined)).toBe(false);
  });
});
