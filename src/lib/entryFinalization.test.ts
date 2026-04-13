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
