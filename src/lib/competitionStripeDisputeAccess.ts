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

  const teamPrefix = `competition-team-entry:${competitionId}:`;
  const prepaidPrefix = `competition-club-prepaid-individual:${competitionId}:`;
  const clubEntryPayment = await prisma.payment.findFirst({
    where: {
      stripeDisputeId: disputeId,
      type: "COMPETITION_ENTRY_FEE",
      ownerType: "CLUB",
      OR: [{ ownerId: { startsWith: teamPrefix } }, { ownerId: { startsWith: prepaidPrefix } }],
    },
    select: { id: true },
  });
  if (clubEntryPayment) return "TEAM_ENTRY_FEE";

  return null;
}

/** チーム請求・クラブ個人枠請求の ownerId から clubId を取り出す（形式不一致時は null） */
export function parseClubIdFromClubCompetitionEntryFeeOwnerId(
  competitionId: string,
  ownerId: string
): string | null {
  const teamPrefix = `competition-team-entry:${competitionId}:`;
  const prepaidPrefix = `competition-club-prepaid-individual:${competitionId}:`;
  if (ownerId.startsWith(teamPrefix)) {
    const clubId = ownerId.slice(teamPrefix.length);
    return clubId.length > 0 ? clubId : null;
  }
  if (ownerId.startsWith(prepaidPrefix)) {
    const clubId = ownerId.slice(prepaidPrefix.length);
    return clubId.length > 0 ? clubId : null;
  }
  return null;
}

/** @deprecated parseClubIdFromClubCompetitionEntryFeeOwnerId を使用 */
export function parseClubIdFromTeamEntryPaymentOwnerId(
  competitionId: string,
  ownerId: string
): string | null {
  return parseClubIdFromClubCompetitionEntryFeeOwnerId(competitionId, ownerId);
}
