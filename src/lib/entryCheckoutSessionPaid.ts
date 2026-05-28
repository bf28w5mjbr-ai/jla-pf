import type { EntryCheckoutSessionStatus, Prisma } from "@prisma/client";

/** EntryCheckoutSession 単体クエリ用（Prisma `in` と Set の両方に使う） */
export const ENTRY_CHECKOUT_PAID_STATUSES = ["COMPLETED", "DISPUTED"] as const satisfies readonly EntryCheckoutSessionStatus[];

/** スタートリスト等「支払い済みとして扱う」Checkout 状態（紛争中は未確定だが出場扱いは維持） */
export const ENTRY_CHECKOUT_PAID_FOR_ELIGIBILITY: ReadonlySet<EntryCheckoutSessionStatus> = new Set(
  ENTRY_CHECKOUT_PAID_STATUSES
);

export function isEntryCheckoutPaidForEligibility(
  status: EntryCheckoutSessionStatus | null | undefined
): boolean {
  return status != null && ENTRY_CHECKOUT_PAID_FOR_ELIGIBILITY.has(status);
}

/** Prisma: 個人有料エントリーで「支払い成立」とみなす Checkout 条件 */
/** Prisma: CompetitionEntry に対し「個人有料の支払い成立」とみなす where 断片 */
export const competitionEntryPaidCheckoutWhere: Prisma.CompetitionEntryWhereInput = {
  checkoutSessions: {
    some: { status: { in: [...ENTRY_CHECKOUT_PAID_STATUSES] } },
  },
};

/**
 * スタートリスト掲載・スナップショット構築用の個人エントリー条件。
 * {@link isEntryEstablished}（entryFinalization）と整合: 無料・クラブ一括払い済み・Checkout 成立のいずれか。
 */
export const competitionEntryEligibleForStartListWhere: Prisma.CompetitionEntryWhereInput = {
  OR: [
    { totalFee: { lte: 0 } },
    { clubIndividualFeePaidAt: { not: null } },
    { organizerManualPaidAt: { not: null } },
    { organizerPostPayApprovedAt: { not: null } },
    competitionEntryPaidCheckoutWhere,
  ],
};
