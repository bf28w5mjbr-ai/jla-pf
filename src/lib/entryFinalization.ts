import type { CompetitionEntryStatus, EntryCheckoutSessionStatus } from "@prisma/client";

import { isEntryCheckoutPaidForEligibility } from "@/lib/entryCheckoutSessionPaid";

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
  const sessions = entry.checkoutSessions ?? [];
  if (sessions.some((s) => s.status === "DISPUTE_LOST")) return false;
  return sessions.some((s) => isEntryCheckoutPaidForEligibility(s.status));
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
  const sessions = entry.checkoutSessions ?? [];
  if (sessions.some((s) => s.status === "DISPUTE_LOST")) {
    return {
      businessEstablished: false,
      userLabel: "決済が無効化されました（カード決済の異議・返金）",
    };
  }
  if (sessions.some((s) => s.status === "DISPUTED")) {
    return {
      businessEstablished: true,
      userLabel: "決済完了（カード決済に異議申し立てあり・要確認）",
    };
  }
  if (sessions.some((s) => s.status === "COMPLETED")) {
    return { businessEstablished: true, userLabel: "決済完了（エントリー成立）" };
  }
  return { businessEstablished: false, userLabel: "手続き完了（入金確認中）" };
}
