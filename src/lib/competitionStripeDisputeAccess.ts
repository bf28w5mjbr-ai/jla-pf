import { prisma } from "@/server/db";

/**
 * 指定 Dispute が当該大会（かつ主催団体）に紐づくエントリー決済かを検証する。
 * 紐づかない場合は null。
 */
export async function findCompetitionScopeForStripeDispute(args: {
  organizationId: string;
  competitionId: string;
  disputeId: string;
}): Promise<"INDIVIDUAL_ENTRY" | "TEAM_ENTRY_FEE" | null> {
  const { organizationId, competitionId, disputeId } = args;

  const competition = await prisma.competition.findFirst({
    where: { id: competitionId, organizationId },
    select: { id: true },
  });
  if (!competition) return null;

  const entrySession = await prisma.entryCheckoutSession.findFirst({
    where: {
      competitionId,
      stripeDisputeId: disputeId,
    },
    select: { id: true },
  });
  if (entrySession) return "INDIVIDUAL_ENTRY";

  const prefix = `competition-team-entry:${competitionId}:`;
  const teamPayment = await prisma.payment.findFirst({
    where: {
      stripeDisputeId: disputeId,
      type: "COMPETITION_ENTRY_FEE",
      ownerType: "CLUB",
      ownerId: { startsWith: prefix },
    },
    select: { id: true },
  });
  if (teamPayment) return "TEAM_ENTRY_FEE";

  return null;
}

/** ownerId からチーム請求の clubId を取り出す（形式不一致時は null） */
export function parseClubIdFromTeamEntryPaymentOwnerId(
  competitionId: string,
  ownerId: string
): string | null {
  const expectedPrefix = `competition-team-entry:${competitionId}:`;
  if (!ownerId.startsWith(expectedPrefix)) return null;
  const clubId = ownerId.slice(expectedPrefix.length);
  return clubId.length > 0 ? clubId : null;
}
