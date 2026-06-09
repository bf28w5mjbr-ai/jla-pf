import { describe, expect, it } from "vitest";
import {
  summarizeCompetitionStripeFinance,
  summarizeIndividualStripeFinance,
  summarizeTeamStripeFinance,
} from "./competitionFinanceSummary";

describe("competitionFinanceSummary", () => {
  it("individual COMPLETED → checkout gross, PF, net revenue", () => {
    const result = summarizeCompetitionStripeFinance({
      entries: [
        {
          totalFee: 10_000,
          status: "SUBMITTED",
          clubIndividualFeePaidAt: null,
          organizerManualPaidAt: null,
          checkoutSessions: [
            {
              status: "COMPLETED",
              amount: 10_360,
              payload: { entryFeeYen: 10_000, processingFeeYen: 360 },
            },
          ],
        },
      ],
      teamPayments: [],
      processingFeeBps: 360,
      platformFeeBps: 800,
    });

    expect(result.settledGrossYen).toBe(10_360);
    expect(result.individualGrossYen).toBe(10_360);
    expect(result.entryGrossYen).toBe(10_000);
    expect(result.refundTotalYen).toBe(0);
    expect(result.processingFeeYen).toBe(360);
    expect(result.platformFeeYen).toBe(800);
    expect(result.netRevenueYen).toBe(9200);
    expect(result.entryIncomeNetYen).toBe(10_000);
  });

  it("stripe refund amount in payload counts full checkout refund", () => {
    const result = summarizeCompetitionStripeFinance({
      entries: [
        {
          totalFee: 8_000,
          status: "SUBMITTED",
          clubIndividualFeePaidAt: null,
          organizerManualPaidAt: null,
          checkoutSessions: [
            {
              status: "COMPLETED",
              amount: 8288,
              payload: {
                entryFeeYen: 8_000,
                processingFeeYen: 288,
                stripeRefundedEntryFeeYen: 8_000,
                stripeAmountRefundedYen: 8288,
                refundedAt: "2026-06-08T00:00:00.000Z",
              },
            },
          ],
        },
      ],
      teamPayments: [],
      platformFeeBps: 800,
    });

    expect(result.settledGrossYen).toBe(8288);
    expect(result.refundTotalYen).toBe(8288);
    expect(result.entryRefundYen).toBe(8000);
    expect(result.platformFeeYen).toBe(0);
    expect(result.netRevenueYen).toBe(0);
  });

  it("refunded individual → gross includes refund, PF excludes refunded", () => {
    const result = summarizeCompetitionStripeFinance({
      entries: [
        {
          totalFee: 10_000,
          status: "CANCELLED",
          clubIndividualFeePaidAt: null,
          organizerManualPaidAt: null,
          checkoutSessions: [
            {
              status: "COMPLETED",
              amount: 10_360,
              payload: {
                entryFeeYen: 10_000,
                processingFeeYen: 360,
                refundedAt: "2026-01-01T00:00:00.000Z",
              },
            },
          ],
        },
      ],
      teamPayments: [],
      platformFeeBps: 800,
    });

    expect(result.settledGrossYen).toBe(10_360);
    expect(result.refundTotalYen).toBe(10_360);
    expect(result.entryRefundYen).toBe(10_000);
    expect(result.processingFeeYen).toBe(0);
    expect(result.platformFeeYen).toBe(0);
    expect(result.netRevenueYen).toBe(0);
  });

  it("DISPUTE_LOST counts as refund", () => {
    const result = summarizeIndividualStripeFinance(
      [
        {
          totalFee: 5_000,
          status: "SUBMITTED",
          clubIndividualFeePaidAt: null,
          organizerManualPaidAt: null,
          checkoutSessions: [
            { status: "DISPUTE_LOST", amount: 5000, payload: { entryFeeYen: 5_000 } },
          ],
        },
      ],
      360,
      800
    );

    expect(result.individualGrossYen).toBe(5_000);
    expect(result.individualRefundYen).toBe(5_000);
    expect(result.platformFeeYen).toBe(0);
  });

  it("team SUCCEEDED + individual COMPLETED combined", () => {
    const result = summarizeCompetitionStripeFinance({
      entries: [
        {
          totalFee: 3_000,
          status: "SUBMITTED",
          clubIndividualFeePaidAt: null,
          organizerManualPaidAt: null,
          checkoutSessions: [
            {
              status: "COMPLETED",
              amount: 3108,
              payload: { entryFeeYen: 3_000, processingFeeYen: 108 },
            },
          ],
        },
      ],
      teamPayments: [
        {
          status: "SUCCEEDED",
          amount: 20_000,
          metadata: { processingFeeYen: "720" },
        },
      ],
      platformFeeBps: 800,
    });

    expect(result.settledGrossYen).toBe(23_828);
    expect(result.individualGrossYen).toBe(3108);
    expect(result.teamGrossYen).toBe(20_720);
    expect(result.processingFeeYen).toBe(828);
    expect(result.platformFeeYen).toBe(1840);
    expect(result.netRevenueYen).toBe(21_160);
  });

  it("team REFUNDED in gross and refund totals", () => {
    const result = summarizeTeamStripeFinance(
      [{ status: "REFUNDED", amount: 15_000, metadata: { processingFeeYen: "540" } }],
      360,
      800
    );

    expect(result.teamGrossYen).toBe(15_540);
    expect(result.teamRefundYen).toBe(15_540);
    expect(result.platformFeeYen).toBe(0);
  });

  it("team duplicate checkout refund via stripeRefundedCheckouts metadata", () => {
    const result = summarizeTeamStripeFinance(
      [
        {
          status: "SUCCEEDED",
          amount: 36_000,
          metadata: {
            processingFeeYen: "1296",
            stripeRefundedEntryFeeYen: 36_000,
            stripeTotalAmountRefundedYen: 37_296,
            stripeRefundedCheckouts: [
              {
                paymentIntentId: "pi_dup",
                amountRefundedYen: 37_296,
                entryFeeRefundedYen: 36_000,
                checkoutGrossYen: 37_296,
              },
            ],
          },
        },
      ],
      360,
      800
    );

    expect(result.teamGrossYen).toBe(74_592);
    expect(result.teamRefundYen).toBe(37_296);
    expect(result.entryRefundYen).toBe(36_000);
    expect(result.processingFeeYen).toBe(1296);
    expect(result.platformFeeGrossYen).toBe(5760);
    expect(result.platformFeeRefundYen).toBe(2880);
    expect(result.platformFeeYen).toBe(2880);
  });

  it("refunded individual excludes PF on refunded entry", () => {
    const result = summarizeCompetitionStripeFinance({
      entries: [
        {
          totalFee: 10_000,
          status: "CANCELLED",
          clubIndividualFeePaidAt: null,
          organizerManualPaidAt: null,
          checkoutSessions: [
            {
              status: "COMPLETED",
              amount: 10_360,
              payload: {
                entryFeeYen: 10_000,
                processingFeeYen: 360,
                stripeAmountRefundedYen: 10_360,
                refundedAt: "2026-01-01T00:00:00.000Z",
              },
            },
          ],
        },
      ],
      teamPayments: [],
      platformFeeBps: 800,
    });

    expect(result.platformFeeGrossYen).toBe(800);
    expect(result.platformFeeRefundYen).toBe(800);
    expect(result.platformFeeYen).toBe(0);
  });

  it("orphan stripe refund adds to gross and refund totals", () => {
    const result = summarizeCompetitionStripeFinance({
      entries: [],
      teamPayments: [],
      stripeOrphanRefunds: [
        {
          checkoutGrossYen: 8000,
          amountRefundedYen: 8000,
          entryFeeRefundedYen: 8000,
        },
      ],
    });

    expect(result.settledGrossYen).toBe(8000);
    expect(result.refundTotalYen).toBe(8000);
    expect(result.entryRefundYen).toBe(8000);
  });

  it("manual payment only → all zeros", () => {
    const result = summarizeCompetitionStripeFinance({
      entries: [
        {
          totalFee: 8_000,
          status: "SUBMITTED",
          clubIndividualFeePaidAt: null,
          organizerManualPaidAt: new Date(),
          checkoutSessions: [],
        },
      ],
      teamPayments: [],
    });

    expect(result.settledGrossYen).toBe(0);
    expect(result.refundTotalYen).toBe(0);
    expect(result.netRevenueYen).toBe(0);
  });

  it("recomputes processing fee when payload missing", () => {
    const result = summarizeIndividualStripeFinance(
      [
        {
          totalFee: 10_000,
          status: "SUBMITTED",
          clubIndividualFeePaidAt: null,
          organizerManualPaidAt: null,
          checkoutSessions: [{ status: "COMPLETED", amount: 0, payload: {} }],
        },
      ],
      360,
      800
    );

    expect(result.processingFeeYen).toBe(374);
  });

  it("club individual paid without stripe session is excluded", () => {
    const result = summarizeCompetitionStripeFinance({
      entries: [
        {
          totalFee: 5_000,
          status: "SUBMITTED",
          clubIndividualFeePaidAt: new Date(),
          organizerManualPaidAt: null,
          checkoutSessions: [],
        },
      ],
      teamPayments: [],
    });

    expect(result.settledGrossYen).toBe(0);
  });

  it("computes stripe processing surplus from stored balance transaction fees", () => {
    const result = summarizeCompetitionStripeFinance({
      entries: [
        {
          totalFee: 8_000,
          status: "SUBMITTED",
          clubIndividualFeePaidAt: null,
          organizerManualPaidAt: null,
          checkoutSessions: [
            {
              status: "COMPLETED",
              amount: 8334,
              payload: {
                entryFeeYen: 8_000,
                processingFeeYen: 334,
                stripeBalanceTransactionFeeYen: 328,
              },
            },
          ],
        },
      ],
      teamPayments: [],
      processingFeeBps: 400,
      platformFeeBps: 800,
    });

    expect(result.entryIncomeNetYen).toBe(8_000);
    expect(result.processingFeeCollectedYen).toBe(334);
    expect(result.actualStripeFeeYen).toBe(328);
    expect(result.stripeProcessingSurplusYen).toBe(6);
    expect(result.stripeFeeDataComplete).toBe(true);
    expect(result.stripeFeeExpectedCount).toBe(1);
    expect(result.stripeFeeRecordedCount).toBe(1);
  });

  it("marks stripe fee data incomplete when fees are missing", () => {
    const result = summarizeCompetitionStripeFinance({
      entries: [
        {
          totalFee: 8_000,
          status: "SUBMITTED",
          clubIndividualFeePaidAt: null,
          organizerManualPaidAt: null,
          checkoutSessions: [
            { status: "COMPLETED", amount: 8288, payload: { entryFeeYen: 8_000, processingFeeYen: 288 } },
          ],
        },
      ],
      teamPayments: [],
    });

    expect(result.stripeFeeDataComplete).toBe(false);
    expect(result.actualStripeFeeYen).toBe(0);
    expect(result.stripeProcessingSurplusYen).toBe(288);
  });
});
