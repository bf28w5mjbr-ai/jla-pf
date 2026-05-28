import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  computePaymentIntentTokenExpiresAt,
  hashPaymentIntentToken,
} from "./paymentIntentToken";
import {
  UNPAID_INTENT_DEADLINE_DNS_REASON,
  processCampaignDeadline,
} from "./entryPaymentIntent";

describe("paymentIntentToken", () => {
  it("hash is deterministic", () => {
    expect(hashPaymentIntentToken("abc")).toBe(hashPaymentIntentToken("abc"));
    expect(hashPaymentIntentToken("abc")).not.toBe(hashPaymentIntentToken("xyz"));
  });

  it("expiresAt is at least deadline", () => {
    const deadline = new Date("2026-06-01T12:00:00Z");
    const expires = computePaymentIntentTokenExpiresAt(deadline);
    expect(expires.getTime()).toBeGreaterThanOrEqual(deadline.getTime());
  });
});

describe("entryPaymentIntent constants", () => {
  it("deadline DNS reason is set", () => {
    expect(UNPAID_INTENT_DEADLINE_DNS_REASON).toContain("未決済");
  });
});

describe("processCampaignDeadline", () => {
  it("returns 0 when deadline has not passed", async () => {
    const prisma = {
      competitionUnpaidEntryIntentCampaign: {
        findUnique: vi.fn().mockResolvedValue({
          id: "camp1",
          competitionId: "comp1",
          responseDeadlineAt: new Date(Date.now() + 86_400_000),
          sentByUserId: "user1",
        }),
      },
    } as unknown as PrismaClient;

    const result = await processCampaignDeadline(prisma, "camp1");
    expect(result.processedCount).toBe(0);
  });

  it("sets deadlineDnsAppliedAt and counts DNS when overdue", async () => {
    const tokenUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      competitionUnpaidEntryIntentCampaign: {
        findUnique: vi.fn().mockResolvedValue({
          id: "camp1",
          competitionId: "comp1",
          responseDeadlineAt: new Date(Date.now() - 60_000),
          sentByUserId: "user1",
        }),
      },
      competitionEntryPaymentIntentToken: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "tok1",
            entryId: "entry1",
            entry: {
              status: "SUBMITTED",
              totalFee: 5000,
              clubIndividualFeePaidAt: null,
              organizerPostPayApprovedAt: null,
              organizerManualPaidAt: null,
              checkoutSessions: [],
            },
          },
        ]),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          competitionEntry: {
            findFirst: vi.fn().mockResolvedValue({
              id: "entry1",
              items: [{ eventId: "ev1" }],
            }),
          },
          competitionParticipantStatus: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findFirst: vi.fn().mockResolvedValue({ id: "ps1" }),
            create: vi.fn(),
          },
          competitionEntryPaymentIntentToken: {
            update: tokenUpdate,
          },
        };
        await fn(tx);
      }),
    } as unknown as PrismaClient;

    const result = await processCampaignDeadline(prisma, "camp1");
    expect(result.processedCount).toBe(1);
    expect(tokenUpdate).toHaveBeenCalledWith({
      where: { id: "tok1" },
      data: { deadlineDnsAppliedAt: expect.any(Date) },
    });
  });

  it("marks deadlineDnsAppliedAt without DNS when entry is no longer unpaid", async () => {
    const tokenUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      competitionUnpaidEntryIntentCampaign: {
        findUnique: vi.fn().mockResolvedValue({
          id: "camp1",
          competitionId: "comp1",
          responseDeadlineAt: new Date(Date.now() - 60_000),
          sentByUserId: "user1",
        }),
      },
      competitionEntryPaymentIntentToken: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "tok1",
            entryId: "entry1",
            entry: {
              status: "SUBMITTED",
              totalFee: 5000,
              clubIndividualFeePaidAt: null,
              organizerPostPayApprovedAt: new Date(),
              organizerManualPaidAt: new Date(),
              checkoutSessions: [],
            },
          },
        ]),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          competitionEntry: {
            findFirst: vi.fn(),
          },
          competitionParticipantStatus: {
            updateMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
          },
          competitionEntryPaymentIntentToken: {
            update: tokenUpdate,
          },
        };
        await fn(tx);
      }),
    } as unknown as PrismaClient;

    const result = await processCampaignDeadline(prisma, "camp1");
    expect(result.processedCount).toBe(0);
    expect(tokenUpdate).toHaveBeenCalled();
  });
});
