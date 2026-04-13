import type { EntryCheckoutSessionStatus } from "@prisma/client";
import { isEntryCheckoutPaidForEligibility } from "@/lib/entryCheckoutSessionPaid";

type SessionLike = {
  status: EntryCheckoutSessionStatus;
  completedAt: Date | null;
  createdAt: Date;
  amount?: number;
};

/**
 * 領収書の発行日・Stripe セッション特定に使う「最終的に有効となった決済」を選ぶ。
 * checkoutSessions の並び順に依存せず、完了日時が最も新しい支払済みセッションを採用する。
 */
export function pickLatestPaidCheckoutForReceipt<T extends SessionLike>(sessions: T[]): T | null {
  const paid = sessions.filter((s) => isEntryCheckoutPaidForEligibility(s.status));
  if (paid.length === 0) return null;
  return paid.reduce((best, cur) => {
    const bestT = (best.completedAt ?? best.createdAt).getTime();
    const curT = (cur.completedAt ?? cur.createdAt).getTime();
    return curT >= bestT ? cur : best;
  });
}
