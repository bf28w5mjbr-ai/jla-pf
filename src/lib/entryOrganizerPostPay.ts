import type { CompetitionEntryStatus, EntryCheckoutSessionStatus } from "@prisma/client";

import { isEntryCheckoutPaidForEligibility } from "@/lib/entryCheckoutSessionPaid";
import { isEntryEstablished, type EntryLike } from "@/lib/entryFinalization";

export type { EntryLike };

export function hasOrganizerPostPayApproval(entry: {
  organizerPostPayApprovedAt?: Date | null;
}): boolean {
  return entry.organizerPostPayApprovedAt != null;
}

/** 参加費が収益上「入金済み」とみなせるか（後払い承認のみは false） */
export function isEntryFeeSettled(entry: EntryLike): boolean {
  if (entry.status !== "SUBMITTED") return false;
  if (entry.totalFee <= 0) return true;
  if (entry.clubIndividualFeePaidAt) return true;
  if (entry.organizerManualPaidAt) return true;
  const sessions = entry.checkoutSessions ?? [];
  return sessions.some((s) => isEntryCheckoutPaidForEligibility(s.status));
}

export function canApproveOrganizerPostPay(entry: EntryLike): boolean {
  if (entry.status === "CANCELLED") return false;
  if (entry.totalFee <= 0) return false;
  if (hasOrganizerPostPayApproval(entry)) return false;
  return !isEntryEstablished(entry);
}

export function canRevokeOrganizerPostPay(entry: EntryLike): boolean {
  if (!hasOrganizerPostPayApproval(entry)) return false;
  return !isEntryFeeSettled(entry);
}

export function canRecordOrganizerManualPayment(entry: EntryLike): boolean {
  if (entry.status === "CANCELLED") return false;
  if (entry.totalFee <= 0) return false;
  if (!hasOrganizerPostPayApproval(entry)) return false;
  return !isEntryFeeSettled(entry);
}

export function entryHasPendingCheckoutSession(
  checkoutSessions: { status: EntryCheckoutSessionStatus }[] | undefined
): boolean {
  return (checkoutSessions ?? []).some((s) => s.status === "PENDING");
}
