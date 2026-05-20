import type { PrismaClient } from "@prisma/client";
import { resolveClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import { resolveEntryFeeUnits } from "@/lib/competitionEntryAgeTiered";
import { ENTRY_CHECKOUT_PAID_STATUSES } from "@/lib/entryCheckoutSessionPaid";
import {
  billingCountsForPersonalEntryPost,
  calculateCompetitionEntryFee,
  type CompetitionEntryFeeConfig,
} from "@/lib/entryFee";
import {
  countSnapshotRowsForEntryBilling,
  isTeamOnlyIntentWithoutItemSelectionFromSnapshot,
} from "@/lib/teamOnlyIntentZeroFeeReconcile";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type CompetitionForPrepaidReconcile = {
  id: string;
  startDate: Date;
  entryFee: unknown;
  ageCategories: {
    id: string;
    displayOrder: number;
    eligibleBirthDateFrom: Date | null;
    eligibleBirthDateTo: Date | null;
  }[];
};

/** POST entries の先払い個人枠相殺と同型（テスト用にも export） */
export function applyInstantPrepaidWaiverToBaseFee(
  baseEntryFee: number,
  clubIndividualBillingTiming: ReturnType<typeof resolveClubIndividualEntryBillingTiming>,
  entryItemsCount: number,
  teamEntryRowsInSnapshot: number,
  feeUnits: { individualUnit: number; ageTierMissing: boolean }
): { totalFee: number; appliedWaiver: boolean } {
  if (baseEntryFee <= 0) {
    return { totalFee: baseEntryFee, appliedWaiver: false };
  }
  if (clubIndividualBillingTiming !== "INSTANT_PREPAID") {
    return { totalFee: baseEntryFee, appliedWaiver: false };
  }
  const hasItems = entryItemsCount > 0;
  const noSnapshotTeamRows = teamEntryRowsInSnapshot === 0;
  if (!hasItems || !noSnapshotTeamRows || feeUnits.ageTierMissing) {
    return { totalFee: baseEntryFee, appliedWaiver: false };
  }
  const individualPortion = hasItems ? feeUnits.individualUnit : 0;
  const nextFee = Math.max(0, baseEntryFee - individualPortion);
  const applied = nextFee < baseEntryFee;
  return { totalFee: nextFee, appliedWaiver: applied };
}

async function expirePendingCheckoutSessions(tx: Tx, entryId: string, now: Date): Promise<number> {
  const res = await tx.entryCheckoutSession.updateMany({
    where: {
      entryId,
      status: "PENDING",
    },
    data: {
      status: "EXPIRED",
      expiredAt: now,
    },
  });
  return res.count;
}

/**
 * 選手が先にエントリー済みでも、クラブが後から個人枠を追加／先払い成立後に料金・Checkout を POST と整合させる。
 * - 締切後枠: 未完了の個人 Checkout を EXPIRED にし、クラブ一括請求フローへ誘導
 * - 先払い ACTIVE_WAIVER: 個人 1 単価分の相殺（POST と同式）。totalFee=0 なら枠 CONSUMED
 */
export async function reconcileRetroactiveClubPrepaidSlotsForUsersInTx(
  tx: Tx,
  params: {
    competition: CompetitionForPrepaidReconcile;
    clubId: string;
    coveredUserIds: string[];
  }
): Promise<void> {
  const { competition, clubId } = params;
  const coveredUserIds = [...new Set(params.coveredUserIds.filter(Boolean))];
  if (coveredUserIds.length === 0) return;

  const clubIndividualBillingTiming = resolveClubIndividualEntryBillingTiming(competition.entryFee);
  const now = new Date();

  for (const userId of coveredUserIds) {
    const lockKey = `club-prepaid-reconcile:${competition.id}:${userId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const slot = await tx.clubCompetitionPrepaidIndividualSlot.findFirst({
      where: {
        competitionId: competition.id,
        clubId,
        coveredUserId: userId,
        status: { in: ["DEFERRED_POST_CLOSE", "ACTIVE_WAIVER"] },
        consumedByEntryId: null,
      },
      select: { id: true, status: true },
    });
    if (!slot) continue;

    const entry = await tx.competitionEntry.findFirst({
      where: {
        competitionId: competition.id,
        clubId,
        userId,
        status: "SUBMITTED",
      },
      select: {
        id: true,
        clubId: true,
        totalFee: true,
        clubIndividualFeePaidAt: true,
        items: { select: { id: true } },
        snapshot: { select: { data: true } },
        checkoutSessions: {
          where: { status: { in: [...ENTRY_CHECKOUT_PAID_STATUSES] } },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!entry) continue;
    if (entry.clubIndividualFeePaidAt) continue;
    if (entry.checkoutSessions.length > 0) continue;

    const snap = entry.snapshot?.data ?? null;
    const teamOnlyIntent = isTeamOnlyIntentWithoutItemSelectionFromSnapshot(entry.clubId, snap);
    const { teamEntryRows } = countSnapshotRowsForEntryBilling(snap);
    const entryItemsCount = entry.items.length;

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { dateOfBirth: true } } },
    });
    const userDob = user?.profile?.dateOfBirth ? new Date(user.profile.dateOfBirth) : null;
    const userAge = userDob
      ? getCompetitionEligibilityAgeYears(userDob, new Date(competition.startDate))
      : null;

    const feeUnits = resolveEntryFeeUnits(competition.entryFee, userAge, {
      userDateOfBirth: userDob,
      competitionAgeCategories: competition.ageCategories,
    });

    const { individualCount: feeIndividualCount, teamCount: feeTeamCount } =
      billingCountsForPersonalEntryPost({
        teamOnlyIntentWithoutItemSelection: teamOnlyIntent,
        entryItemsCount,
        teamEntriesCount: teamEntryRows,
      });

    const baseEntryFee = calculateCompetitionEntryFee(
      competition.entryFee as CompetitionEntryFeeConfig | number | null,
      {
        individualCount: feeIndividualCount,
        teamCount: feeTeamCount,
      },
      {
        userAgeYearsAtCompetitionStart: userAge,
        userDateOfBirth: userDob,
        competitionAgeCategories: competition.ageCategories,
      }
    );

    if (slot.status === "DEFERRED_POST_CLOSE") {
      await expirePendingCheckoutSessions(tx, entry.id, now);
      continue;
    }

    // ACTIVE_WAIVER — POST と同様、ティア不定時は先払い相殺しない
    if (
      feeUnits.ageTierMissing &&
      feeIndividualCount + feeTeamCount > 0 &&
      clubIndividualBillingTiming === "INSTANT_PREPAID"
    ) {
      continue;
    }

    const { totalFee: waivedFee, appliedWaiver } = applyInstantPrepaidWaiverToBaseFee(
      baseEntryFee,
      clubIndividualBillingTiming,
      entryItemsCount,
      teamEntryRows,
      feeUnits
    );

    if (!appliedWaiver) {
      continue;
    }

    const nextFee = waivedFee;
    if (nextFee !== entry.totalFee) {
      await expirePendingCheckoutSessions(tx, entry.id, now);
      await tx.competitionEntry.update({
        where: { id: entry.id },
        data: { totalFee: nextFee },
      });
    }

    if (nextFee === 0 && slot.status === "ACTIVE_WAIVER") {
      const consumed = await tx.clubCompetitionPrepaidIndividualSlot.updateMany({
        where: {
          id: slot.id,
          status: "ACTIVE_WAIVER",
          consumedByEntryId: null,
        },
        data: {
          status: "CONSUMED",
          consumedAt: now,
          consumedByEntryId: entry.id,
        },
      });
      if (consumed.count === 0) {
        // 並行処理で競合した場合は他経路で済んでいる
      }
    }
  }
}

export async function reconcileRetroactiveClubPrepaidSlotsAfterTeamEntrySave(
  prisma: PrismaClient,
  params: {
    competitionId: string;
    clubId: string;
    coveredUserIds: string[];
  }
): Promise<void> {
  const competition = await loadCompetitionForPrepaidReconcile(prisma, params.competitionId);
  if (!competition || params.coveredUserIds.length === 0) return;
  await prisma.$transaction(async (tx) => {
    await reconcileRetroactiveClubPrepaidSlotsForUsersInTx(tx, {
      competition,
      clubId: params.clubId,
      coveredUserIds: params.coveredUserIds,
    });
  });
}

export async function loadCompetitionForPrepaidReconcile(
  tx: Tx,
  competitionId: string
): Promise<CompetitionForPrepaidReconcile | null> {
  return tx.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      startDate: true,
      entryFee: true,
      ageCategories: {
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          displayOrder: true,
          eligibleBirthDateFrom: true,
          eligibleBirthDateTo: true,
        },
      },
    },
  });
}
