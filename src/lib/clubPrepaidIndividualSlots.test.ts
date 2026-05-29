import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateClubPrepaidSlotsAfterPayment,
  applyClubTeamAndPrepaidStripeSideEffects,
  parseClubPrepaidPaymentMetadata,
} from "./clubPrepaidIndividualSlots";
import * as reconcileModule from "./clubPrepaidIndividualSlotRetroactiveReconcile";

vi.mock("./clubPrepaidIndividualSlotRetroactiveReconcile", async (importOriginal) => {
  const actual = await importOriginal<typeof reconcileModule>();
  return {
    ...actual,
    loadCompetitionForPrepaidReconcile: vi.fn(),
    reconcileRetroactiveClubPrepaidSlotsForUsersInTx: vi.fn(),
  };
});

describe("parseClubPrepaidPaymentMetadata", () => {
  it("extracts clubId and competitionId from object metadata", () => {
    expect(
      parseClubPrepaidPaymentMetadata({
        clubId: "club1",
        competitionId: "comp1",
      })
    ).toEqual({ clubId: "club1", competitionId: "comp1" });
  });

  it("returns null for invalid metadata", () => {
    expect(parseClubPrepaidPaymentMetadata(null)).toBeNull();
    expect(parseClubPrepaidPaymentMetadata({ clubId: "x" })).toBeNull();
  });
});

describe("applyClubTeamAndPrepaidStripeSideEffects", () => {
  const paymentId = "pay_test";
  const clubId = "club_test";
  const competitionId = "comp_test";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reconcileModule.loadCompetitionForPrepaidReconcile).mockResolvedValue({
      id: competitionId,
      startDate: new Date("2026-06-01"),
      entryFee: {},
      ageCategories: [],
    });
    vi.mocked(reconcileModule.reconcileRetroactiveClubPrepaidSlotsForUsersInTx).mockResolvedValue(
      undefined
    );
  });

  it("runs three separate transactions (activate, reconcile, deferred)", async () => {
    const txHandlers: Array<(tx: unknown) => Promise<unknown>> = [];
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) => {
        txHandlers.push(fn);
        const tx = buildMockTx({
          payment: {
            id: paymentId,
            status: "SUCCEEDED",
            type: "COMPETITION_ENTRY_FEE",
            ownerId: `competition-club-prepaid-individual:${competitionId}:${clubId}`,
            metadata: { clubId, competitionId, scope: "CLUB_PREPAID_INDIVIDUAL" },
          },
          activeWaiverUserIds: ["user1"],
          deferredSlots: [],
        });
        return fn(tx);
      }),
    };

    await applyClubTeamAndPrepaidStripeSideEffects(
      prisma as unknown as Parameters<typeof applyClubTeamAndPrepaidStripeSideEffects>[0],
      paymentId
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(txHandlers).toHaveLength(3);
    expect(prisma.$transaction).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      expect.objectContaining({ timeout: 10_000 })
    );
    expect(prisma.$transaction).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      expect.objectContaining({ timeout: 55_000 })
    );
    expect(prisma.$transaction).toHaveBeenNthCalledWith(
      3,
      expect.any(Function),
      expect.objectContaining({ timeout: 55_000 })
    );
    expect(reconcileModule.reconcileRetroactiveClubPrepaidSlotsForUsersInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clubId,
        coveredUserIds: ["user1"],
      })
    );
  });

  it("can complete reconcile on second call when slots were already activated", async () => {
    let activateCalls = 0;
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = buildMockTx({
          payment: {
            id: paymentId,
            status: "SUCCEEDED",
            type: "COMPETITION_ENTRY_FEE",
            ownerId: `competition-club-prepaid-individual:${competitionId}:${clubId}`,
            metadata: { clubId, competitionId },
          },
          pendingSlotUpdates: activateCalls === 0 ? 6 : 0,
          activeWaiverUserIds: ["user1", "user2"],
          deferredSlots: [],
        });
        activateCalls += 1;
        return fn(tx);
      }),
    };

    await applyClubTeamAndPrepaidStripeSideEffects(
      prisma as unknown as Parameters<typeof applyClubTeamAndPrepaidStripeSideEffects>[0],
      paymentId
    );
    await applyClubTeamAndPrepaidStripeSideEffects(
      prisma as unknown as Parameters<typeof applyClubTeamAndPrepaidStripeSideEffects>[0],
      paymentId
    );

    expect(reconcileModule.reconcileRetroactiveClubPrepaidSlotsForUsersInTx).toHaveBeenCalledTimes(2);
  });

  it("activateClubPrepaidSlotsAfterPayment returns null when payment is not SUCCEEDED", async () => {
    const tx = buildMockTx({
      payment: {
        id: paymentId,
        status: "PENDING",
        type: "COMPETITION_ENTRY_FEE",
        ownerId: `competition-club-prepaid-individual:${competitionId}:${clubId}`,
        metadata: { clubId, competitionId },
      },
    });
    const result = await activateClubPrepaidSlotsAfterPayment(
      tx as unknown as Parameters<typeof activateClubPrepaidSlotsAfterPayment>[0],
      paymentId
    );
    expect(result).toBeNull();
    expect(tx.clubCompetitionPrepaidIndividualSlot.updateMany).not.toHaveBeenCalled();
  });
});

function buildMockTx(params: {
  payment: {
    id: string;
    status: string;
    type: string;
    ownerId: string;
    metadata: Record<string, string>;
  };
  pendingSlotUpdates?: number;
  activeWaiverUserIds?: string[];
  deferredSlots?: { id: string; coveredUserId: string }[];
}) {
  const {
    payment,
    pendingSlotUpdates = 0,
    activeWaiverUserIds = [],
    deferredSlots = [],
  } = params;

  return {
    payment: {
      findUnique: vi.fn().mockResolvedValue(payment),
    },
    clubCompetitionPrepaidIndividualSlot: {
      updateMany: vi.fn().mockResolvedValue({ count: pendingSlotUpdates }),
      findMany: vi.fn().mockImplementation(async (args: { where?: { status?: string } }) => {
        if (args.where?.status === "DEFERRED_POST_CLOSE") {
          return deferredSlots;
        }
        return activeWaiverUserIds.map((coveredUserId) => ({ coveredUserId }));
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    competitionEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}
