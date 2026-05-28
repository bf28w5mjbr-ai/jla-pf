import { describe, expect, it } from "vitest";

import { isEntryEstablished } from "./entryFinalization";
import {
  canApproveOrganizerPostPay,
  canRecordOrganizerManualPayment,
  canRevokeOrganizerPostPay,
  isEntryFeeSettled,
} from "./entryOrganizerPostPay";

const base = {
  status: "SUBMITTED" as const,
  totalFee: 3000,
  checkoutSessions: [] as { status: "PENDING" }[],
};

describe("entryOrganizerPostPay", () => {
  it("後払い承認のみで成立するが未入金", () => {
    const entry = {
      ...base,
      organizerPostPayApprovedAt: new Date(),
    };
    expect(isEntryEstablished(entry)).toBe(true);
    expect(isEntryFeeSettled(entry)).toBe(false);
    expect(canRevokeOrganizerPostPay(entry)).toBe(true);
    expect(canRecordOrganizerManualPayment(entry)).toBe(true);
  });

  it("手動入金で入金済み", () => {
    const entry = {
      ...base,
      organizerPostPayApprovedAt: new Date(),
      organizerManualPaidAt: new Date(),
    };
    expect(isEntryFeeSettled(entry)).toBe(true);
    expect(canRevokeOrganizerPostPay(entry)).toBe(false);
    expect(canRecordOrganizerManualPayment(entry)).toBe(false);
  });

  it("未決済試行は承認可能", () => {
    expect(canApproveOrganizerPostPay(base)).toBe(true);
    expect(canRevokeOrganizerPostPay(base)).toBe(false);
  });

  it("承認済みは再承認不可", () => {
    const entry = { ...base, organizerPostPayApprovedAt: new Date() };
    expect(canApproveOrganizerPostPay(entry)).toBe(false);
  });
});
