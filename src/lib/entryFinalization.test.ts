import { describe, expect, it } from "vitest";

import { getEntryUserFacingStatus, isEntryEstablished } from "./entryFinalization";

describe("entryFinalization / チャージバック系ステータス", () => {
  it("DISPUTED でもエントリー成立扱い", () => {
    const r = getEntryUserFacingStatus({
      status: "SUBMITTED",
      totalFee: 1000,
      checkoutSessions: [{ status: "DISPUTED" }],
    });
    expect(r.businessEstablished).toBe(true);
    expect(r.userLabel).toContain("異議");
  });

  it("clubIndividualFeePaidAt があれば Checkout なしで成立", () => {
    const r = getEntryUserFacingStatus({
      status: "SUBMITTED",
      totalFee: 3000,
      checkoutSessions: [],
      clubIndividualFeePaidAt: new Date(),
    });
    expect(r.businessEstablished).toBe(true);
    expect(isEntryEstablished({
      status: "SUBMITTED",
      totalFee: 3000,
      checkoutSessions: [],
      clubIndividualFeePaidAt: new Date(),
    })).toBe(true);
  });

  it("organizerPostPayApprovedAt があれば未 Checkout でも成立", () => {
    const r = getEntryUserFacingStatus({
      status: "SUBMITTED",
      totalFee: 2000,
      checkoutSessions: [],
      organizerPostPayApprovedAt: new Date(),
    });
    expect(r.businessEstablished).toBe(true);
    expect(r.userLabel).toContain("お支払い待ち");
    expect(
      isEntryEstablished({
        status: "SUBMITTED",
        totalFee: 2000,
        checkoutSessions: [],
        organizerPostPayApprovedAt: new Date(),
      })
    ).toBe(true);
  });

  it("organizerManualPaidAt で主催確認の決済完了", () => {
    const r = getEntryUserFacingStatus({
      status: "SUBMITTED",
      totalFee: 2000,
      checkoutSessions: [],
      organizerManualPaidAt: new Date(),
    });
    expect(r.businessEstablished).toBe(true);
    expect(r.userLabel).toContain("主催確認");
  });

  it("DISPUTE_LOST では成立しない", () => {
    const r = getEntryUserFacingStatus({
      status: "SUBMITTED",
      totalFee: 1000,
      checkoutSessions: [{ status: "DISPUTE_LOST" }],
    });
    expect(r.businessEstablished).toBe(false);
    expect(isEntryEstablished({
      status: "SUBMITTED",
      totalFee: 1000,
      checkoutSessions: [{ status: "DISPUTE_LOST" }],
    })).toBe(false);
  });
});
