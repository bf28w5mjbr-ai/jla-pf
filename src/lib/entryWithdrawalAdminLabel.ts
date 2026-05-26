/**
 * 大会管理画面のエントリー状況表示（棄権申請 = DNS + reason に「棄権」を含む）
 */

export type EntryForPaymentLabel = {
  status: string;
  totalFee: number;
  checkoutSessions: { status: string; payload: unknown }[];
};

export type ParticipantStatusRow = {
  eventId: string;
  status: string;
  reason: string | null;
};

export function getIndividualEntryPaymentStatusLabel(entry: EntryForPaymentLabel): string {
  if (entry.status === "CANCELLED") {
    const checkout = entry.checkoutSessions[0];
    const payload =
      checkout?.payload && typeof checkout.payload === "object"
        ? (checkout.payload as Record<string, unknown>)
        : null;
    if (typeof payload?.refundedAt === "string" || entry.totalFee === 0) {
      return "返金 / 取消済み";
    }
    return "取消済み";
  }
  if (entry.totalFee === 0) return "決済不要（受付済み）";
  const sessionRecord = entry.checkoutSessions[0];
  const st = sessionRecord?.status;
  if (st === "DISPUTE_LOST") return "決済無効（異議・返金確定）";
  if (st === "DISPUTED") return "決済完了（異議申し立て中）";
  if (st === "COMPLETED") return "決済完了";
  return "決済確認中";
}

export function isIndividualWithdrawalDns(row: {
  status: string;
  reason: string | null | undefined;
}): boolean {
  return row.status === "DNS" && typeof row.reason === "string" && row.reason.includes("棄権");
}

/** 当該種目で棄権申請済み（個人エントリー）か */
export function hasIndividualWithdrawalForEvent(
  participantStatuses: ParticipantStatusRow[],
  eventId: string
): boolean {
  return participantStatuses.some(
    (row) => row.eventId === eventId && isIndividualWithdrawalDns(row)
  );
}

/** 個人種目の eventId 一覧（現行 EntryItem。棄権ラベル・スタートリスト整合と同じ母数） */
export function getIndividualEventIdsFromEntry(entry: {
  items: { eventId: string }[];
}): string[] {
  const ids = entry.items
    .map((item) => item.eventId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...new Set(ids)];
}

export function buildAdminIndividualEntryStatusLabel(args: {
  entry: EntryForPaymentLabel;
  entryEventIds: string[];
  participantStatuses: ParticipantStatusRow[];
}): string {
  const paymentLabel = getIndividualEntryPaymentStatusLabel(args.entry);
  if (args.entry.status === "CANCELLED") {
    return paymentLabel;
  }

  const withdrawn = new Set(
    args.participantStatuses.filter(isIndividualWithdrawalDns).map((r) => r.eventId)
  );
  if (withdrawn.size === 0) return paymentLabel;

  const eventIds = args.entryEventIds;
  const n = eventIds.length;
  const wCount = n > 0 ? eventIds.filter((id) => withdrawn.has(id)).length : withdrawn.size;

  if (n === 0) {
    return `棄権（${paymentLabel}）`;
  }
  if (wCount >= n) {
    return `棄権（${paymentLabel}）`;
  }
  if (wCount > 0) {
    return `一部棄権（${wCount}/${n}種目）（${paymentLabel}）`;
  }
  // 種目行と participantStatuses の eventId が一致しない場合のフォールバック
  return `棄権（${paymentLabel}）`;
}

/** エントリー一覧カードの「状態」行 */
export function getAdminEntryLifecycleStateLabel(args: {
  entryStatus: string;
  entryEventIds: string[];
  participantStatuses: ParticipantStatusRow[];
}): string {
  if (args.entryStatus === "CANCELLED") return "取消済み";

  const withdrawn = new Set(
    args.participantStatuses.filter(isIndividualWithdrawalDns).map((r) => r.eventId)
  );
  if (withdrawn.size === 0) return "受付済み";

  const eventIds = args.entryEventIds;
  const n = eventIds.length;
  const wCount = n > 0 ? eventIds.filter((id) => withdrawn.has(id)).length : withdrawn.size;

  if (n === 0) return "棄権";
  if (wCount >= n) return "棄権";
  if (wCount > 0) return `一部棄権（${wCount}/${n}種目）`;
  return "棄権";
}
