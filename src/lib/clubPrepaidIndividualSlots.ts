import type { PrismaClient } from "@prisma/client";
import { shouldApplyClubPrepaidStripeSideEffects } from "@/lib/teamEntryPayments";
import {
  loadCompetitionForPrepaidReconcile,
  reconcileRetroactiveClubPrepaidSlotsForUsersInTx,
} from "@/lib/clubPrepaidIndividualSlotRetroactiveReconcile";
import { resolveClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import { resolveEntryFeeUnits } from "@/lib/competitionEntryAgeTiered";
import {
  partitionUnderBandsForCompetition,
  type CompetitionUnderAgeDbFields,
} from "@/lib/competitionUnderAgeSettings";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** 先払いモードでチーム請求に上乗せする個人分（円） */
export async function sumInstantPrepaidIndividualsYen(
  tx: Tx,
  params: {
    startDate: Date;
    entryFee: unknown;
    underAge: CompetitionUnderAgeDbFields;
    ageCategories: {
      id: string;
      displayOrder: number;
      eligibleBirthDateFrom: Date | null;
      eligibleBirthDateTo: Date | null;
    }[];
    coveredUserIds: string[];
  }
): Promise<number> {
  if (params.coveredUserIds.length === 0) return 0;
  if (resolveClubIndividualEntryBillingTiming(params.entryFee) !== "INSTANT_PREPAID") {
    return 0;
  }

  const users = await tx.user.findMany({
    where: { id: { in: params.coveredUserIds } },
    select: { id: true, dateOfBirth: true },
  });
  const underPartition = partitionUnderBandsForCompetition(params.underAge);
  let sum = 0;
  for (const u of users) {
    const dob = u.dateOfBirth ? new Date(u.dateOfBirth) : null;
    const age = dob
      ? getCompetitionEligibilityAgeYears(dob, new Date(params.startDate))
      : null;
    const { individualUnit, ageTierMissing } = resolveEntryFeeUnits(params.entryFee, age, {
      userDateOfBirth: dob,
      competitionAgeCategories: params.ageCategories,
      underFeePartition: underPartition ?? null,
    });
    if (ageTierMissing) continue;
    sum += individualUnit;
  }
  return sum;
}

export async function replaceClubPrepaidSlotsForSave(
  tx: Tx,
  params: {
    competitionId: string;
    clubId: string;
    prepaidIndividualUserIds: string[];
    billingTiming: ReturnType<typeof resolveClubIndividualEntryBillingTiming>;
    /** 先払いモードのみ。締切後モードでは未使用 */
    paymentId?: string | null;
  }
): Promise<void> {
  await tx.clubCompetitionPrepaidIndividualSlot.deleteMany({
    where: {
      competitionId: params.competitionId,
      clubId: params.clubId,
      status: {
        in: ["PENDING_CLUB_CHECKOUT", "ACTIVE_WAIVER", "DEFERRED_POST_CLOSE"],
      },
      consumedByEntryId: null,
    },
  });

  if (params.prepaidIndividualUserIds.length === 0) return;

  const status =
    params.billingTiming === "INSTANT_PREPAID" ? "PENDING_CLUB_CHECKOUT" : "DEFERRED_POST_CLOSE";

  const clubPaymentId =
    params.billingTiming === "INSTANT_PREPAID" && params.paymentId ? params.paymentId : null;

  await tx.clubCompetitionPrepaidIndividualSlot.createMany({
    data: params.prepaidIndividualUserIds.map((coveredUserId) => ({
      competitionId: params.competitionId,
      clubId: params.clubId,
      coveredUserId,
      status,
      clubPaymentId,
    })),
  });
}

/** Stripe の CLUB 大会参加費 Checkout 成功後：先払い枠の有効化と、締切後枠に紐づく個人エントリーの清算 */
export async function applyClubTeamAndPrepaidStripeSideEffects(
  prisma: PrismaClient,
  paymentId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, metadata: true, type: true, ownerId: true },
    });
    if (!payment || payment.status !== "SUCCEEDED" || payment.type !== "COMPETITION_ENTRY_FEE") return;
    if (!shouldApplyClubPrepaidStripeSideEffects(payment)) return;

    await tx.clubCompetitionPrepaidIndividualSlot.updateMany({
      where: {
        clubPaymentId: paymentId,
        status: "PENDING_CLUB_CHECKOUT",
      },
      data: { status: "ACTIVE_WAIVER" },
    });

    const meta = payment.metadata;
    const clubId =
      meta && typeof meta === "object" && !Array.isArray(meta) && typeof (meta as { clubId?: unknown }).clubId === "string"
        ? (meta as { clubId: string }).clubId
        : null;
    const competitionId =
      meta &&
      typeof meta === "object" &&
      !Array.isArray(meta) &&
      typeof (meta as { competitionId?: unknown }).competitionId === "string"
        ? (meta as { competitionId: string }).competitionId
        : null;

    if (!clubId || !competitionId) return;

    const competition = await loadCompetitionForPrepaidReconcile(tx, competitionId);
    if (competition) {
      const activeWaiverUsers = await tx.clubCompetitionPrepaidIndividualSlot.findMany({
        where: {
          clubPaymentId: paymentId,
          status: "ACTIVE_WAIVER",
          consumedByEntryId: null,
        },
        select: { coveredUserId: true },
      });
      const activeIds = [...new Set(activeWaiverUsers.map((r) => r.coveredUserId))];
      if (activeIds.length > 0) {
        await reconcileRetroactiveClubPrepaidSlotsForUsersInTx(tx, {
          competition,
          clubId,
          coveredUserIds: activeIds,
        });
      }
    }

    const deferredSlots = await tx.clubCompetitionPrepaidIndividualSlot.findMany({
      where: {
        competitionId,
        clubId,
        status: "DEFERRED_POST_CLOSE",
      },
      select: { id: true, coveredUserId: true },
    });
    if (deferredSlots.length === 0) return;

    const now = new Date();
    for (const slot of deferredSlots) {
      const entry = await tx.competitionEntry.findFirst({
        where: {
          competitionId,
          clubId,
          userId: slot.coveredUserId,
          status: "SUBMITTED",
          totalFee: { gt: 0 },
          clubIndividualFeePaidAt: null,
        },
        select: {
          id: true,
          checkoutSessions: {
            where: { status: { in: ["COMPLETED", "DISPUTED"] } },
            take: 1,
            select: { id: true },
          },
        },
      });
      if (!entry || entry.checkoutSessions.length > 0) continue;

      await tx.competitionEntry.update({
        where: { id: entry.id },
        data: { clubIndividualFeePaidAt: now },
      });
      await tx.clubCompetitionPrepaidIndividualSlot.update({
        where: { id: slot.id },
        data: {
          status: "CONSUMED",
          clubPaymentId: paymentId,
          consumedAt: now,
          consumedByEntryId: entry.id,
        },
      });
    }
  });
}

export async function sumDeferredUnpaidIndividualEntryFeesYen(
  tx: Tx,
  params: { competitionId: string; clubId: string }
): Promise<number> {
  const slots = await tx.clubCompetitionPrepaidIndividualSlot.findMany({
    where: {
      competitionId: params.competitionId,
      clubId: params.clubId,
      status: "DEFERRED_POST_CLOSE",
    },
    select: { coveredUserId: true },
  });
  const userIds = [...new Set(slots.map((s) => s.coveredUserId))];
  if (userIds.length === 0) return 0;

  const entries = await tx.competitionEntry.findMany({
    where: {
      competitionId: params.competitionId,
      clubId: params.clubId,
      userId: { in: userIds },
      status: "SUBMITTED",
      totalFee: { gt: 0 },
      clubIndividualFeePaidAt: null,
    },
    select: {
      id: true,
      totalFee: true,
      checkoutSessions: {
        where: { status: { in: ["COMPLETED", "DISPUTED"] } },
        select: { id: true },
        take: 1,
      },
    },
  });

  let sum = 0;
  for (const e of entries) {
    if (e.checkoutSessions.length > 0) continue;
    sum += e.totalFee;
  }
  return sum;
}
