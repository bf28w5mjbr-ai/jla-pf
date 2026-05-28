import type { EntryCheckoutSessionStatus, Prisma, PrismaClient } from "@prisma/client";

import type { EntryLike } from "@/lib/entryFinalization";
import {
  canApproveOrganizerPostPay,
  canRecordOrganizerManualPayment,
  canRevokeOrganizerPostPay,
  entryHasPendingCheckoutSession,
} from "@/lib/entryOrganizerPostPay";

const entrySelectForPostPay = {
  id: true,
  competitionId: true,
  status: true,
  totalFee: true,
  clubIndividualFeePaidAt: true,
  organizerPostPayApprovedAt: true,
  organizerPostPayApprovedByUserId: true,
  organizerManualPaidAt: true,
  organizerManualPaidByUserId: true,
  organizerManualPaidNote: true,
  checkoutSessions: {
    orderBy: { createdAt: "desc" as const },
    select: { id: true, status: true },
  },
} as const;

export type EntryForOrganizerPostPay = EntryLike & {
  id: string;
  competitionId: string;
  checkoutSessions: { id: string; status: EntryCheckoutSessionStatus }[];
};

export async function loadEntryForOrganizerPostPay(
  prisma: PrismaClient,
  competitionId: string,
  entryId: string
): Promise<EntryForOrganizerPostPay | null> {
  return prisma.competitionEntry.findFirst({
    where: { id: entryId, competitionId },
    select: entrySelectForPostPay,
  });
}

type PostPayDb = PrismaClient | Prisma.TransactionClient;

export async function expirePendingEntryCheckoutSessions(
  prisma: PostPayDb,
  entryId: string
): Promise<number> {
  const result = await prisma.entryCheckoutSession.updateMany({
    where: { entryId, status: "PENDING" },
    data: { status: "EXPIRED", expiredAt: new Date() },
  });
  return result.count;
}

export {
  canApproveOrganizerPostPay,
  canRecordOrganizerManualPayment,
  canRevokeOrganizerPostPay,
  entryHasPendingCheckoutSession,
};
