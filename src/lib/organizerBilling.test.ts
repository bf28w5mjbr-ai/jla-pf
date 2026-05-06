import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrganizerBillingSnapshot } from "@/lib/organizerBilling";
import {
  paidEntryCheckoutBlockReason,
  resolveEntryCheckoutStripeConnectParams,
} from "@/lib/organizerBilling";

function snap(overrides: Partial<OrganizerBillingSnapshot>): OrganizerBillingSnapshot {
  return {
    onboardingFeeStatus: "PAID",
    organizerSubscriptionStatus: "ACTIVE",
    stripeConnectAccountId: "acct_123",
    stripeConnectChargesEnabled: true,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("paidEntryCheckoutBlockReason", () => {
  it("PLATFORM 選択時は Connect 未設定でも許可する", () => {
    const r = paidEntryCheckoutBlockReason(
      snap({
        stripeConnectAccountId: null,
        stripeConnectChargesEnabled: false,
      }),
      { stripeSettlementAccountType: "PLATFORM" }
    );
    expect(r).toBe(null);
  });

  it("ORGANIZER_CONNECT 時は Connect 未設定ならブロック", () => {
    const r = paidEntryCheckoutBlockReason(
      snap({
        stripeConnectAccountId: null,
        stripeConnectChargesEnabled: false,
      }),
      { stripeSettlementAccountType: "ORGANIZER_CONNECT" }
    );
    expect(r).toContain("Stripe Connect");
  });

  it("プラットフォーム利用未完了なら PLATFORM でもブロック", () => {
    const r = paidEntryCheckoutBlockReason(
      snap({
        onboardingFeeStatus: "NOT_PAID",
        organizerSubscriptionStatus: "NONE",
        stripeConnectAccountId: null,
        stripeConnectChargesEnabled: false,
      }),
      { stripeSettlementAccountType: "PLATFORM" }
    );
    expect(r).toContain("プラットフォーム利用登録が未完了");
  });
});

describe("resolveEntryCheckoutStripeConnectParams", () => {
  it("skipConnectEnv が true のときは送金しない", () => {
    expect(
      resolveEntryCheckoutStripeConnectParams({
        skipConnectEnv: true,
        stripeSettlementAccountType: "ORGANIZER_CONNECT",
        org: snap({}),
        applicationFeeWithProcessing: 999,
      })
    ).toEqual({
      destinationConnectAccountId: null,
      applicationFeeAmountYen: null,
    });
  });

  it("PLATFORM かつ Connect 整備済みでは送金先を付ける", () => {
    expect(
      resolveEntryCheckoutStripeConnectParams({
        skipConnectEnv: false,
        stripeSettlementAccountType: "PLATFORM",
        org: snap({ stripeConnectAccountId: "acct_x", stripeConnectChargesEnabled: true }),
        applicationFeeWithProcessing: 500,
      })
    ).toEqual({
      destinationConnectAccountId: "acct_x",
      applicationFeeAmountYen: 500,
    });
  });

  it("PLATFORM かつ Connect 未整備では送金しない", () => {
    expect(
      resolveEntryCheckoutStripeConnectParams({
        skipConnectEnv: false,
        stripeSettlementAccountType: "PLATFORM",
        org: snap({
          stripeConnectAccountId: null,
          stripeConnectChargesEnabled: false,
        }),
        applicationFeeWithProcessing: 500,
      })
    ).toEqual({
      destinationConnectAccountId: null,
      applicationFeeAmountYen: null,
    });
  });

  it("ORGANIZER_CONNECT は主催側 Connect を使う（呼び出し元前提）", () => {
    expect(
      resolveEntryCheckoutStripeConnectParams({
        skipConnectEnv: false,
        stripeSettlementAccountType: "ORGANIZER_CONNECT",
        org: snap({ stripeConnectAccountId: "acct_y" }),
        applicationFeeWithProcessing: 120,
      })
    ).toEqual({
      destinationConnectAccountId: "acct_y",
      applicationFeeAmountYen: 120,
    });
  });
});
