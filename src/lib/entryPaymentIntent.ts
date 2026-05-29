import type {
  EntryCheckoutSessionStatus,
  EntryPaymentIntentChoice,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import type { EntryLike } from "@/lib/entryFinalization";
import { isEntryFeeSettled } from "@/lib/entryOrganizerPostPay";
import { expirePendingEntryCheckoutSessions } from "@/lib/entryOrganizerPostPayService";

type Tx = Prisma.TransactionClient;

export const UNPAID_INTENT_DEADLINE_DNS_REASON = "未決済確認・期限切れ";

export type UnpaidIntentEmailTarget = {
  entryId: string;
  userId: string;
  email: string;
  fullName: string;
  totalFee: number;
};

function entryLikeFromRow(entry: {
  status: EntryLike["status"];
  totalFee: number;
  clubIndividualFeePaidAt: Date | null;
  organizerPostPayApprovedAt: Date | null;
  organizerManualPaidAt: Date | null;
  checkoutSessions: { status: string }[];
}): EntryLike {
  return {
    status: entry.status,
    totalFee: entry.totalFee,
    clubIndividualFeePaidAt: entry.clubIndividualFeePaidAt,
    organizerPostPayApprovedAt: entry.organizerPostPayApprovedAt,
    organizerManualPaidAt: entry.organizerManualPaidAt,
    checkoutSessions: entry.checkoutSessions.map((s) => ({
      status: s.status as EntryCheckoutSessionStatus,
    })),
  };
}

function isFullyWithdrawnIndividual(entry: {
  items: { eventId: string }[];
  participantStatuses: { eventId: string; status: string; reason: string | null }[];
}): boolean {
  const eventIds = [...new Set(entry.items.map((i) => i.eventId).filter(Boolean))];
  if (eventIds.length === 0) return false;
  const withdrawn = new Set(
    entry.participantStatuses
      .filter(
        (row) =>
          row.status === "DNS" &&
          typeof row.reason === "string" &&
          row.reason.includes("棄権")
      )
      .map((row) => row.eventId)
  );
  return eventIds.every((id) => withdrawn.has(id));
}

export async function listUnpaidIntentEmailTargets(
  prisma: PrismaClient,
  competitionId: string
): Promise<{ targets: UnpaidIntentEmailTarget[]; skippedNoEmail: number }> {
  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId,
      status: "SUBMITTED",
      totalFee: { gt: 0 },
    },
    select: {
      id: true,
      userId: true,
      totalFee: true,
      status: true,
      clubIndividualFeePaidAt: true,
      organizerPostPayApprovedAt: true,
      organizerManualPaidAt: true,
      items: { select: { eventId: true } },
      participantStatuses: {
        select: { eventId: true, status: true, reason: true },
      },
      checkoutSessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
      user: {
        select: {
          email: true,
          profile: { select: { familyName: true, givenName: true } },
        },
      },
    },
  });

  const targets: UnpaidIntentEmailTarget[] = [];
  let skippedNoEmail = 0;

  for (const entry of entries) {
    const like = entryLikeFromRow(entry);
    if (isEntryFeeSettled(like)) continue;
    if (isFullyWithdrawnIndividual(entry)) continue;

    const email = entry.user.email?.trim();
    if (!email) {
      skippedNoEmail += 1;
      continue;
    }

    const fullName =
      `${entry.user.profile?.familyName ?? ""} ${entry.user.profile?.givenName ?? ""}`.trim() ||
      email;

    targets.push({
      entryId: entry.id,
      userId: entry.userId,
      email,
      fullName,
      totalFee: entry.totalFee,
    });
  }

  return { targets, skippedNoEmail };
}

/** 出場意思メールの対象判定（listUnpaidIntentEmailTargets と同じ） */
export function entryQualifiesForUnpaidIntentEmail(entry: {
  status: string;
  totalFee: number;
  clubIndividualFeePaidAt: Date | null;
  organizerPostPayApprovedAt: Date | null;
  organizerManualPaidAt: Date | null;
  items: { eventId: string }[];
  participantStatuses: { eventId: string; status: string; reason: string | null }[];
  checkoutSessions: { status: string }[];
}): boolean {
  if (entry.status !== "SUBMITTED" || entry.totalFee <= 0) return false;
  const like = entryLikeFromRow(entry);
  if (isEntryFeeSettled(like)) return false;
  if (isFullyWithdrawnIndividual(entry)) return false;
  return true;
}

export type IntentCampaignTokenSummaryInput = {
  choice: EntryPaymentIntentChoice | null;
  respondedAt: Date | null;
  deadlineDnsAppliedAt: Date | null;
  emailDeliveredAt: Date | null;
  entry: {
    status: string;
    totalFee: number;
    clubIndividualFeePaidAt: Date | null;
    organizerPostPayApprovedAt: Date | null;
    organizerManualPaidAt: Date | null;
    items: { eventId: string }[];
    participantStatuses: { eventId: string; status: string; reason: string | null }[];
    checkoutSessions: { status: string }[];
  };
};

export type IntentCampaignSummary = {
  totalTokens: number;
  participateCount: number;
  withdrawCount: number;
  /** トークン上は未回答 */
  tokenPendingCount: number;
  /** 出場意思の回答がまだ必要（未決済かつメール対象相当） */
  actionRequiredCount: number;
  deadlineDnsFlagCount: number;
  emailDeliveredCount: number;
  emailUndeliveredCount: number;
};

export function summarizeIntentCampaignTokens(
  tokens: IntentCampaignTokenSummaryInput[]
): IntentCampaignSummary {
  let participateCount = 0;
  let withdrawCount = 0;
  let tokenPendingCount = 0;
  let actionRequiredCount = 0;
  let deadlineDnsFlagCount = 0;
  let emailDeliveredCount = 0;
  let emailUndeliveredCount = 0;

  for (const t of tokens) {
    if (t.choice === "PARTICIPATE") participateCount += 1;
    if (t.choice === "WITHDRAW") withdrawCount += 1;
    if (t.respondedAt == null && t.deadlineDnsAppliedAt == null) tokenPendingCount += 1;
    if (t.deadlineDnsAppliedAt != null) deadlineDnsFlagCount += 1;
    if (t.emailDeliveredAt != null) emailDeliveredCount += 1;
    else emailUndeliveredCount += 1;

    const needsResponse =
      t.respondedAt == null &&
      t.deadlineDnsAppliedAt == null &&
      entryQualifiesForUnpaidIntentEmail(t.entry);
    if (needsResponse) actionRequiredCount += 1;
  }

  return {
    totalTokens: tokens.length,
    participateCount,
    withdrawCount,
    tokenPendingCount,
    actionRequiredCount,
    deadlineDnsFlagCount,
    emailDeliveredCount,
    emailUndeliveredCount,
  };
}

export async function approveEntryViaParticipantIntent(
  tx: Tx,
  entryId: string
): Promise<void> {
  const entry = await tx.competitionEntry.findUnique({
    where: { id: entryId },
    select: {
      status: true,
      totalFee: true,
      organizerPostPayApprovedAt: true,
      clubIndividualFeePaidAt: true,
      organizerManualPaidAt: true,
      checkoutSessions: { select: { status: true } },
    },
  });
  if (!entry) throw new Error("ENTRY_NOT_FOUND");
  if (entry.status === "CANCELLED") throw new Error("ENTRY_CANCELLED");
  if (entry.totalFee <= 0) throw new Error("ENTRY_FREE");

  const like = entryLikeFromRow({
    ...entry,
    checkoutSessions: entry.checkoutSessions,
  });
  if (isEntryFeeSettled(like)) return;
  if (entry.organizerPostPayApprovedAt) return;

  await tx.competitionEntry.update({
    where: { id: entryId },
    data: {
      organizerPostPayApprovedAt: new Date(),
      organizerPostPayApprovedByUserId: null,
    },
  });
}

export async function cancelEntryAsParticipantWithdraw(
  tx: Tx,
  params: { entryId: string; competitionId: string; userId: string }
): Promise<void> {
  const entry = await tx.competitionEntry.findFirst({
    where: { id: params.entryId, competitionId: params.competitionId },
    select: { id: true, status: true, userId: true },
  });
  if (!entry) throw new Error("ENTRY_NOT_FOUND");
  if (entry.status === "CANCELLED") return;

  await tx.competitionEntry.update({
    where: { id: params.entryId },
    data: { status: "CANCELLED" },
  });

  await expirePendingEntryCheckoutSessions(tx, params.entryId);

  await tx.teamEntryMember.deleteMany({
    where: {
      userId: params.userId,
      role: "ATHLETE",
      teamEntry: { competitionId: params.competitionId },
    },
  });
}

export async function applyDnsForUnpaidIntentDeadline(
  tx: Tx,
  params: {
    competitionId: string;
    entryId: string;
    updatedByUserId: string | null;
    reason?: string;
  }
): Promise<number> {
  const reason = params.reason ?? UNPAID_INTENT_DEADLINE_DNS_REASON;

  const entry = await tx.competitionEntry.findFirst({
    where: {
      id: params.entryId,
      competitionId: params.competitionId,
      status: "SUBMITTED",
    },
    select: {
      id: true,
      items: { select: { eventId: true } },
    },
  });
  if (!entry) return 0;

  const eventIds = [...new Set(entry.items.map((item) => item.eventId))];
  if (eventIds.length === 0) return 0;

  let count = 0;
  for (const eventId of eventIds) {
    await tx.competitionParticipantStatus.updateMany({
      where: {
        competitionId: params.competitionId,
        eventId,
        participantType: "INDIVIDUAL",
        competitionEntryId: entry.id,
        teamEntryId: null,
      },
      data: {
        status: "DNS",
        reason,
        calledAt: null,
        updatedByUserId: params.updatedByUserId,
      },
    });
    const anyRow = await tx.competitionParticipantStatus.findFirst({
      where: {
        competitionId: params.competitionId,
        eventId,
        participantType: "INDIVIDUAL",
        competitionEntryId: entry.id,
        teamEntryId: null,
      },
      select: { id: true },
    });
    if (!anyRow) {
      await tx.competitionParticipantStatus.create({
        data: {
          competitionId: params.competitionId,
          eventId,
          participantType: "INDIVIDUAL",
          competitionEntryId: entry.id,
          marshalRound: "HEAT",
          status: "DNS",
          reason,
          calledAt: null,
          updatedByUserId: params.updatedByUserId,
        },
      });
    }
    count += 1;
  }
  return count;
}

export async function processCampaignDeadline(
  prisma: PrismaClient,
  campaignId: string
): Promise<{ processedCount: number }> {
  const campaign = await prisma.competitionUnpaidEntryIntentCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      competitionId: true,
      responseDeadlineAt: true,
      sentByUserId: true,
    },
  });
  if (!campaign) return { processedCount: 0 };

  const now = new Date();
  if (now <= campaign.responseDeadlineAt) return { processedCount: 0 };

  const tokens = await prisma.competitionEntryPaymentIntentToken.findMany({
    where: {
      campaignId,
      respondedAt: null,
      deadlineDnsAppliedAt: null,
    },
    select: {
      id: true,
      entryId: true,
      entry: {
        select: {
          status: true,
          totalFee: true,
          clubIndividualFeePaidAt: true,
          organizerPostPayApprovedAt: true,
          organizerManualPaidAt: true,
          checkoutSessions: { select: { status: true } },
        },
      },
    },
  });

  let processedCount = 0;
  const closedAt = new Date();
  for (const token of tokens) {
    const entry = token.entry;
    const like = entryLikeFromRow({
      ...entry,
      checkoutSessions: entry.checkoutSessions,
    });
    const shouldApplyDns =
      entry.status === "SUBMITTED" && !isEntryFeeSettled(like);

    await prisma.$transaction(async (tx) => {
      if (shouldApplyDns) {
        const dnsCount = await applyDnsForUnpaidIntentDeadline(tx, {
          competitionId: campaign.competitionId,
          entryId: token.entryId,
          updatedByUserId: campaign.sentByUserId,
        });
        if (dnsCount > 0) {
          processedCount += 1;
        }
      }
      await tx.competitionEntryPaymentIntentToken.update({
        where: { id: token.id },
        data: { deadlineDnsAppliedAt: closedAt },
      });
    });
  }

  return { processedCount };
}

export async function processAllOverdueCampaignDeadlines(
  prisma: PrismaClient
): Promise<{ campaignsProcessed: number; entriesProcessed: number }> {
  const now = new Date();
  const campaigns = await prisma.competitionUnpaidEntryIntentCampaign.findMany({
    where: { responseDeadlineAt: { lt: now } },
    select: { id: true },
    orderBy: { sentAt: "asc" },
  });

  let entriesProcessed = 0;
  for (const c of campaigns) {
    const { processedCount } = await processCampaignDeadline(prisma, c.id);
    entriesProcessed += processedCount;
  }

  return { campaignsProcessed: campaigns.length, entriesProcessed };
}

export type PaymentIntentTokenRow = {
  id: string;
  campaignId: string;
  entryId: string;
  expiresAt: Date;
  choice: EntryPaymentIntentChoice | null;
  respondedAt: Date | null;
  campaign: {
    competitionId: string;
    responseDeadlineAt: Date;
    competition: { id: string; name: string; status: string };
  };
  entry: {
    id: string;
    userId: string;
    status: string;
    totalFee: number;
    clubIndividualFeePaidAt: Date | null;
    organizerPostPayApprovedAt: Date | null;
    organizerManualPaidAt: Date | null;
    items: { event: { name: string; sex: string } | null }[];
    checkoutSessions: { status: string }[];
    user: {
      profile: { familyName: string | null; givenName: string | null } | null;
    };
  };
};

const tokenSelect = {
  id: true,
  campaignId: true,
  entryId: true,
  expiresAt: true,
  choice: true,
  respondedAt: true,
  campaign: {
    select: {
      competitionId: true,
      responseDeadlineAt: true,
      competition: { select: { id: true, name: true, status: true } },
    },
  },
  entry: {
    select: {
      id: true,
      userId: true,
      status: true,
      totalFee: true,
      clubIndividualFeePaidAt: true,
      organizerPostPayApprovedAt: true,
      organizerManualPaidAt: true,
      items: {
        select: {
          event: { select: { name: true, sex: true } },
        },
      },
      checkoutSessions: {
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: { status: true },
      },
      user: {
        select: {
          profile: { select: { familyName: true, givenName: true } },
        },
      },
    },
  },
} satisfies Prisma.CompetitionEntryPaymentIntentTokenSelect;

export async function findPaymentIntentTokenByRaw(
  prisma: PrismaClient,
  competitionId: string,
  rawToken: string
): Promise<PaymentIntentTokenRow | null> {
  const { hashPaymentIntentToken } = await import("@/lib/paymentIntentToken");
  const tokenHash = hashPaymentIntentToken(rawToken);
  return prisma.competitionEntryPaymentIntentToken.findFirst({
    where: {
      tokenHash,
      campaign: { competitionId },
    },
    select: tokenSelect,
  });
}

export function formatPaymentIntentPublicState(row: PaymentIntentTokenRow): {
  valid: boolean;
  expired: boolean;
  alreadyResponded: boolean;
  competitionName: string;
  participantName: string;
  eventsLabel: string;
  responseDeadlineAt: string;
  totalFee: number;
  choice: EntryPaymentIntentChoice | null;
  entryCancelled: boolean;
} {
  const now = Date.now();
  const expired = now > row.expiresAt.getTime();
  const alreadyResponded = row.respondedAt != null;
  const entryCancelled = row.entry.status === "CANCELLED";

  const sexLabel = (sex: string) =>
    sex === "MALE" ? "男子" : sex === "FEMALE" ? "女子" : "混合";

  const eventsLabel = row.entry.items
    .map((item) =>
      item.event ? `${item.event.name}（${sexLabel(item.event.sex)}）` : null
    )
    .filter((x): x is string => Boolean(x))
    .join(" / ");

  const participantName =
    `${row.entry.user.profile?.familyName ?? ""} ${row.entry.user.profile?.givenName ?? ""}`.trim() ||
    "参加者";

  return {
    valid: !expired && !entryCancelled,
    expired,
    alreadyResponded,
    competitionName: row.campaign.competition.name,
    participantName,
    eventsLabel: eventsLabel || "—",
    responseDeadlineAt: row.campaign.responseDeadlineAt.toISOString(),
    totalFee: row.entry.totalFee,
    choice: row.choice,
    entryCancelled,
  };
}

export async function respondToPaymentIntent(
  prisma: PrismaClient,
  params: {
    tokenRow: PaymentIntentTokenRow;
    choice: "participate" | "withdraw";
  }
): Promise<{ choice: EntryPaymentIntentChoice }> {
  if (params.tokenRow.respondedAt) {
    throw new Error("ALREADY_RESPONDED");
  }
  if (Date.now() > params.tokenRow.expiresAt.getTime()) {
    throw new Error("TOKEN_EXPIRED");
  }
  if (params.tokenRow.entry.status === "CANCELLED") {
    throw new Error("ENTRY_CANCELLED");
  }

  const competitionId = params.tokenRow.campaign.competitionId;
  const entryId = params.tokenRow.entryId;
  const userId = params.tokenRow.entry.userId;
  const now = new Date();

  if (params.choice === "participate") {
    await prisma.$transaction(async (tx) => {
      await approveEntryViaParticipantIntent(tx, entryId);
      await tx.competitionEntryPaymentIntentToken.update({
        where: { id: params.tokenRow.id },
        data: {
          choice: "PARTICIPATE",
          respondedAt: now,
        },
      });
    });
    return { choice: "PARTICIPATE" };
  }

  await prisma.$transaction(async (tx) => {
    await cancelEntryAsParticipantWithdraw(tx, {
      entryId,
      competitionId,
      userId,
    });
    await tx.competitionEntryPaymentIntentToken.update({
      where: { id: params.tokenRow.id },
      data: {
        choice: "WITHDRAW",
        respondedAt: now,
      },
    });
  });
  return { choice: "WITHDRAW" };
}
