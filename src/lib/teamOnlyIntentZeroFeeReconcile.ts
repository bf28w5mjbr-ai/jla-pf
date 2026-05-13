import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import type { CompetitionAgeCategoryForEntryFee } from "@/lib/competitionEntryAgeTiered";
import { ENTRY_CHECKOUT_PAID_STATUSES } from "@/lib/entryCheckoutSessionPaid";
import {
  billingCountsForPersonalEntryPost,
  calculateCompetitionEntryFee,
  type CompetitionEntryFeeConfig,
} from "@/lib/entryFee";
import { extractClubIdFromEntrySnapshotData } from "@/lib/entrySnapshotClubId";
import { prisma } from "@/server/db";

/** `serializeEntrySnapshotPayload` と同様に有効行数だけ数える */
export function countSnapshotRowsForEntryBilling(data: unknown): {
  itemRows: number;
  teamEntryRows: number;
} {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { itemRows: 0, teamEntryRows: 0 };
  }
  const o = data as Record<string, unknown>;
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const teamRaw = Array.isArray(o.teamEntries) ? o.teamEntries : [];
  let itemRows = 0;
  for (const row of itemsRaw) {
    if (!row || typeof row !== "object") continue;
    const eventId = (row as Record<string, unknown>).eventId;
    if (typeof eventId === "string" && eventId.trim()) itemRows += 1;
  }
  let teamEntryRows = 0;
  for (const row of teamRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const eventId = typeof r.eventId === "string" ? r.eventId : "";
    const teamName = typeof r.teamName === "string" ? r.teamName.trim() : "";
    if (eventId && teamName) teamEntryRows += 1;
  }
  return { itemRows, teamEntryRows };
}

export function resolveClubIdForTeamOnlyIntent(
  entryClubId: string | null,
  snapshotData: unknown
): string | null {
  const fromEntry = entryClubId?.trim() ? entryClubId.trim() : null;
  const fromSnap = extractClubIdFromEntrySnapshotData(snapshotData);
  return fromEntry ?? fromSnap;
}

/** POST の `teamOnlyIntentWithoutItemSelection` と同型のスナップショットか */
export function isTeamOnlyIntentWithoutItemSelectionFromSnapshot(
  entryClubId: string | null,
  snapshotData: unknown
): boolean {
  const { itemRows, teamEntryRows } = countSnapshotRowsForEntryBilling(snapshotData);
  const clubId = resolveClubIdForTeamOnlyIntent(entryClubId, snapshotData);
  return itemRows === 0 && teamEntryRows === 0 && typeof clubId === "string" && clubId.length > 0;
}

export type TeamOnlyIntentFeeComputationInput = {
  competitionStartDate: Date;
  entryFee: CompetitionEntryFeeConfig | number | null;
  ageCategories: ReadonlyArray<CompetitionAgeCategoryForEntryFee>;
  userDateOfBirth: Date | null;
};

export function computeTeamOnlyIntentPersonalEntryFee(
  input: TeamOnlyIntentFeeComputationInput
): number {
  const userDob = input.userDateOfBirth;
  const userAge = userDob
    ? getCompetitionEligibilityAgeYears(userDob, new Date(input.competitionStartDate))
    : null;
  const { individualCount, teamCount } = billingCountsForPersonalEntryPost({
    teamOnlyIntentWithoutItemSelection: true,
    entryItemsCount: 0,
    teamEntriesCount: 0,
  });
  return calculateCompetitionEntryFee(
    input.entryFee,
    { individualCount, teamCount },
    {
      userAgeYearsAtCompetitionStart: userAge,
      userDateOfBirth: userDob,
      competitionAgeCategories: input.ageCategories,
    }
  );
}

/**
 * チーム種目のみ意図で totalFee=0 のまま SUBMITTED の行を、POST と同じ式で再計算し正の料金へ是正する。
 * @returns 更新した場合 true
 */
export async function reconcileTeamOnlyIntentZeroTotalFeeEntry(entryId: string): Promise<boolean> {
  const row = await prisma.competitionEntry.findFirst({
    where: {
      id: entryId,
      status: "SUBMITTED",
      totalFee: 0,
      clubIndividualFeePaidAt: null,
      items: { none: {} },
      NOT: {
        checkoutSessions: {
          some: {
            status: { in: [...ENTRY_CHECKOUT_PAID_STATUSES] },
          },
        },
      },
    },
    select: {
      id: true,
      clubId: true,
      snapshot: { select: { data: true } },
      checkoutSessions: {
        select: { id: true, status: true },
      },
      competition: {
        select: {
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
      },
      user: {
        select: { dateOfBirth: true },
      },
    },
  });

  if (!row) return false;

  const snap = row.snapshot?.data ?? null;
  if (!isTeamOnlyIntentWithoutItemSelectionFromSnapshot(row.clubId, snap)) {
    return false;
  }

  const userDob = row.user?.dateOfBirth ? new Date(row.user.dateOfBirth) : null;
  const nextFee = computeTeamOnlyIntentPersonalEntryFee({
    competitionStartDate: new Date(row.competition.startDate),
    entryFee: row.competition.entryFee as CompetitionEntryFeeConfig | number | null,
    ageCategories: row.competition.ageCategories.map((c) => ({
      id: c.id,
      displayOrder: c.displayOrder,
      eligibleBirthDateFrom: c.eligibleBirthDateFrom,
      eligibleBirthDateTo: c.eligibleBirthDateTo,
    })),
    userDateOfBirth: userDob,
  });

  if (nextFee <= 0) return false;

  const now = new Date();
  const pendingCount = row.checkoutSessions.filter((s) => s.status === "PENDING").length;

  await prisma.$transaction(async (tx) => {
    if (pendingCount > 0) {
      await tx.entryCheckoutSession.updateMany({
        where: {
          entryId: row.id,
          status: "PENDING",
        },
        data: {
          status: "EXPIRED",
          expiredAt: now,
        },
      });
    }
    await tx.competitionEntry.update({
      where: { id: row.id },
      data: { totalFee: nextFee },
    });
  });

  return true;
}
