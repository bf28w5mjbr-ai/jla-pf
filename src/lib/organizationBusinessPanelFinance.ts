import { prisma } from "@/server/db";
import {
  summarizeCompetitionStripeFinance,
  type IndividualEntryFinanceInput,
  type TeamPaymentFinanceInput,
} from "@/lib/competitionFinanceSummary";
import {
  buildClubPrepaidIndividualPaymentOwnerId,
  buildTeamEntryPaymentOwnerId,
} from "@/lib/teamEntryPayments";

export type CompetitionFinanceCompactSummary = {
  entryIncomeNetYen: number;
  platformFeeYen: number;
  netAfterPaidExpenses: number;
};

function groupBy<T, K extends string>(
  items: T[],
  keyFn: (item: T) => K
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const cur = map.get(key);
    if (cur) cur.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export async function loadCompetitionFinanceCompactSummaries(
  competitionIds: string[]
): Promise<Map<string, CompetitionFinanceCompactSummary>> {
  const result = new Map<string, CompetitionFinanceCompactSummary>();
  if (competitionIds.length === 0) return result;

  const [entries, teamEntries, paidExpenses] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: { competitionId: { in: competitionIds } },
      select: {
        competitionId: true,
        totalFee: true,
        status: true,
        clubIndividualFeePaidAt: true,
        organizerManualPaidAt: true,
        checkoutSessions: {
          orderBy: { createdAt: "desc" },
          select: { status: true, amount: true, payload: true },
        },
      },
    }),
    prisma.teamEntry.findMany({
      where: { competitionId: { in: competitionIds } },
      select: { competitionId: true, clubId: true },
    }),
    prisma.expense.findMany({
      where: {
        ownerType: "COMPETITION",
        ownerId: { in: competitionIds },
        status: "PAID",
      },
      select: { ownerId: true, totalAmount: true },
    }),
  ]);

  const teamEntriesByComp = groupBy(teamEntries, (t) => t.competitionId);
  const ownerIdToCompId = new Map<string, string>();
  const allOwnerIds: string[] = [];

  for (const competitionId of competitionIds) {
    const clubIds = [...new Set((teamEntriesByComp.get(competitionId) ?? []).map((t) => t.clubId))];
    for (const clubId of clubIds) {
      for (const ownerId of [
        buildTeamEntryPaymentOwnerId(competitionId, clubId),
        buildClubPrepaidIndividualPaymentOwnerId(competitionId, clubId),
      ]) {
        allOwnerIds.push(ownerId);
        ownerIdToCompId.set(ownerId, competitionId);
      }
    }
  }

  const teamPayments =
    allOwnerIds.length > 0
      ? await prisma.payment.findMany({
          where: {
            ownerType: "CLUB",
            ownerId: { in: allOwnerIds },
            type: "COMPETITION_ENTRY_FEE",
          },
          select: { ownerId: true, status: true, amount: true, metadata: true },
        })
      : [];

  const entriesByComp = groupBy(entries, (e) => e.competitionId);
  const paymentsByComp = new Map<string, TeamPaymentFinanceInput[]>();
  for (const payment of teamPayments) {
    const competitionId = ownerIdToCompId.get(payment.ownerId);
    if (!competitionId) continue;
    const cur = paymentsByComp.get(competitionId) ?? [];
    cur.push({
      status: payment.status,
      amount: payment.amount,
      metadata: payment.metadata,
    });
    paymentsByComp.set(competitionId, cur);
  }

  const expensePaidByComp = new Map<string, number>();
  for (const expense of paidExpenses) {
    expensePaidByComp.set(
      expense.ownerId,
      (expensePaidByComp.get(expense.ownerId) ?? 0) + expense.totalAmount
    );
  }

  for (const competitionId of competitionIds) {
    const compEntries = (entriesByComp.get(competitionId) ?? []).map(
      (e): IndividualEntryFinanceInput => ({
        totalFee: e.totalFee,
        status: e.status,
        clubIndividualFeePaidAt: e.clubIndividualFeePaidAt,
        organizerManualPaidAt: e.organizerManualPaidAt,
        checkoutSessions: e.checkoutSessions,
      })
    );
    const stripeFinance = summarizeCompetitionStripeFinance({
      entries: compEntries,
      teamPayments: paymentsByComp.get(competitionId) ?? [],
    });
    const expensePaidTotal = expensePaidByComp.get(competitionId) ?? 0;
    result.set(competitionId, {
      entryIncomeNetYen: stripeFinance.entryIncomeNetYen,
      platformFeeYen: stripeFinance.platformFeeYen,
      netAfterPaidExpenses:
        stripeFinance.entryIncomeNetYen - stripeFinance.platformFeeYen - expensePaidTotal,
    });
  }

  return result;
}
