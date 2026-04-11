import type { CompetitionEntryStatus, EntryCheckoutSessionStatus } from "@prisma/client";

type CheckoutLike = {
  status: EntryCheckoutSessionStatus;
};

type EntryLike = {
  status: CompetitionEntryStatus;
  totalFee: number;
  checkoutSessions?: CheckoutLike[];
};

export function isEntryEstablished(entry: EntryLike): boolean {
  if (entry.status !== "SUBMITTED") return false;
  if (entry.totalFee <= 0) return true;
  return (entry.checkoutSessions ?? []).some((s) => s.status === "COMPLETED");
}

export function getEntryUserFacingStatus(entry: EntryLike): {
  businessEstablished: boolean;
  userLabel: string;
} {
  if (entry.status === "CANCELLED") {
    return { businessEstablished: false, userLabel: "取消済み" };
  }
  if (entry.totalFee <= 0) {
    return { businessEstablished: true, userLabel: "エントリー成立" };
  }
  if ((entry.checkoutSessions ?? []).some((s) => s.status === "COMPLETED")) {
    return { businessEstablished: true, userLabel: "決済完了（エントリー成立）" };
  }
  return { businessEstablished: false, userLabel: "手続き完了（入金確認中）" };
}
