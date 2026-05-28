import type { CompetitionEntryStatus, EntryCheckoutSessionStatus } from "@prisma/client";

import { isEntryCheckoutPaidForEligibility } from "@/lib/entryCheckoutSessionPaid";

type CheckoutLike = {
  status: EntryCheckoutSessionStatus;
};

export type EntryLike = {
  status: CompetitionEntryStatus;
  totalFee: number;
  checkoutSessions?: CheckoutLike[];
  /** クラブ一括請求で個人分が支払済みになった日時（Stripe 個人 Checkout なしで成立） */
  clubIndividualFeePaidAt?: Date | null;
  organizerPostPayApprovedAt?: Date | null;
  organizerManualPaidAt?: Date | null;
};

export function isEntryEstablished(entry: EntryLike): boolean {
  if (entry.status !== "SUBMITTED") return false;
  if (entry.totalFee <= 0) return true;
  if (entry.clubIndividualFeePaidAt) return true;
  if (entry.organizerManualPaidAt) return true;
  if (entry.organizerPostPayApprovedAt) return true;
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
  if (entry.clubIndividualFeePaidAt) {
    return { businessEstablished: true, userLabel: "決済完了（クラブ一括）" };
  }
  if (entry.organizerManualPaidAt) {
    return { businessEstablished: true, userLabel: "決済完了（主催確認）" };
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
  if (entry.organizerPostPayApprovedAt) {
    return {
      businessEstablished: true,
      userLabel: "エントリー成立（参加費お支払い待ち）",
    };
  }
  return { businessEstablished: false, userLabel: "手続き完了（入金確認中）" };
}
