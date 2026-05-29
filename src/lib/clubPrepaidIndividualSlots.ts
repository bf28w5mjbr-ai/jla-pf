import type { PrismaClient } from "@prisma/client";
import { shouldApplyClubPrepaidStripeSideEffects } from "@/lib/teamEntryPayments";
import {
  loadCompetitionForPrepaidReconcile,
  reconcileRetroactiveClubPrepaidSlotsForUsersInTx,
} from "@/lib/clubPrepaidIndividualSlotRetroactiveReconcile";
import { resolveClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import { resolveEntryFeeUnits } from "@/lib/competitionEntryAgeTiered";

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
    select: { id: true, profile: { select: { dateOfBirth: true } } },
  });
  let sum = 0;
  for (const u of users) {
    const dob = u.profile?.dateOfBirth ? new Date(u.profile.dateOfBirth) : null;
    const age = dob
      ? getCompetitionEligibilityAgeYears(dob, new Date(params.startDate))
      : null;
    const { individualUnit, ageTierMissing } = resolveEntryFeeUnits(params.entryFee, age, {
      userDateOfBirth: dob,
      competitionAgeCategories: params.ageCategories,
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

const CLUB_PREPAID_ACTIVATE_TX = { maxWait: 10_000, timeout: 10_000 } as const;
const CLUB_PREPAID_RECONCILE_TX = { maxWait: 20_000, timeout: 55_000 } as const;

export type ClubPrepaidStripeSideEffectsContext = {
  paymentId: string;
  clubId: string;
  competitionId: string;
};

/** Payment.metadata から clubId / competitionId を取り出す */
export function parseClubPrepaidPaymentMetadata(
  meta: unknown
): Pick<ClubPrepaidStripeSideEffectsContext, "clubId" | "competitionId"> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const record = meta as { clubId?: unknown; competitionId?: unknown };
  if (typeof record.clubId !== "string" || typeof record.competitionId !== "string") {
    return null;
  }
  return { clubId: record.clubId, competitionId: record.competitionId };
}

/** Phase A: 決済成功後に先払い枠を ACTIVE_WAIVER へ（短い TX） */
export async function activateClubPrepaidSlotsAfterPayment(
  tx: Tx,
  paymentId: string
): Promise<ClubPrepaidStripeSideEffectsContext | null> {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, metadata: true, type: true, ownerId: true },
  });
  if (!payment || payment.status !== "SUCCEEDED" || payment.type !== "COMPETITION_ENTRY_FEE") {
    return null;
  }
  if (!shouldApplyClubPrepaidStripeSideEffects(payment)) return null;

  await tx.clubCompetitionPrepaidIndividualSlot.updateMany({
    where: {
      clubPaymentId: paymentId,
      status: "PENDING_CLUB_CHECKOUT",
    },
    data: { status: "ACTIVE_WAIVER" },
  });

  const ids = parseClubPrepaidPaymentMetadata(payment.metadata);
  if (!ids) return null;

  return { paymentId, ...ids };
}

/** Phase B: 既存エントリーへの先払い相殺（長い TX） */
export async function reconcileActiveClubPrepaidWaiversForPayment(
  tx: Tx,
  ctx: ClubPrepaidStripeSideEffectsContext
): Promise<void> {
  const competition = await loadCompetitionForPrepaidReconcile(tx, ctx.competitionId);
  if (!competition) return;

  const activeWaiverUsers = await tx.clubCompetitionPrepaidIndividualSlot.findMany({
    where: {
      clubPaymentId: ctx.paymentId,
      status: "ACTIVE_WAIVER",
      consumedByEntryId: null,
    },
    select: { coveredUserId: true },
  });
  const activeIds = [...new Set(activeWaiverUsers.map((r) => r.coveredUserId))];
  if (activeIds.length === 0) return;

  await reconcileRetroactiveClubPrepaidSlotsForUsersInTx(tx, {
    competition,
    clubId: ctx.clubId,
    coveredUserIds: activeIds,
  });
}

/** Phase C: 締切後請求枠に紐づく個人エントリーのクラブ一括清算 */
export async function settleDeferredClubPrepaidSlotsForPayment(
  tx: Tx,
  ctx: ClubPrepaidStripeSideEffectsContext
): Promise<void> {
  const deferredSlots = await tx.clubCompetitionPrepaidIndividualSlot.findMany({
    where: {
      competitionId: ctx.competitionId,
      clubId: ctx.clubId,
      status: "DEFERRED_POST_CLOSE",
    },
    select: { id: true, coveredUserId: true },
  });
  if (deferredSlots.length === 0) return;

  const now = new Date();
  for (const slot of deferredSlots) {
    const entry = await tx.competitionEntry.findFirst({
      where: {
        competitionId: ctx.competitionId,
        clubId: ctx.clubId,
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
        clubPaymentId: ctx.paymentId,
        consumedAt: now,
        consumedByEntryId: entry.id,
      },
    });
  }
}

/** Stripe の CLUB 大会参加費 Checkout 成功後：先払い枠の有効化と、締切後枠に紐づく個人エントリーの清算 */
export async function applyClubTeamAndPrepaidStripeSideEffects(
  prisma: PrismaClient,
  paymentId: string
): Promise<void> {
  const ctx = await prisma.$transaction(
    (tx) => activateClubPrepaidSlotsAfterPayment(tx, paymentId),
    CLUB_PREPAID_ACTIVATE_TX
  );
  if (!ctx) return;

  await prisma.$transaction(
    (tx) => reconcileActiveClubPrepaidWaiversForPayment(tx, ctx),
    CLUB_PREPAID_RECONCILE_TX
  );

  await prisma.$transaction(
    (tx) => settleDeferredClubPrepaidSlotsForPayment(tx, ctx),
    CLUB_PREPAID_RECONCILE_TX
  );
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
