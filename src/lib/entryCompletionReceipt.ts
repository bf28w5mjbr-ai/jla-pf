import type { CompetitionEntryStatus, EntryCheckoutSessionStatus } from "@prisma/client";
import { isEntryCheckoutPaidForEligibility } from "@/lib/entryCheckoutSessionPaid";
import { getEntryUserFacingStatus } from "@/lib/entryFinalization";
import { getStripeProcessingFeeBpsFromEnv } from "@/lib/stripeProcessingFee";

type CheckoutRow = {
  status: string;
  stripeCheckoutSessionId: string | null;
  stripeReceiptUrl?: string | null;
  /** Stripe 請求合計（参加費＋決済手数料上乗せがある場合を含む） */
  amount: number;
  payload: unknown;
};

type EntryRow = {
  id: string;
  status: string;
  totalFee: number;
  clubIndividualFeePaidAt?: Date | null;
  items: { eventId: string; entryTime: string | null }[];
  snapshot: { data: unknown } | null;
  checkoutSessions: CheckoutRow[];
  club: { name: string } | null;
};

type EventRow = { id: string; name: string; sex: string };

export type EntryReceiptForClient = {
  competitionName: string;
  blurb: string;
  entryId: string;
  totalFee: number;
  requireClubMembership: boolean;
  clubName: string | null;
  statusRow: { label: string; icon: "check" | "clock"; tone: "emerald" | "muted" | "gray" };
  showPaymentPendingBlock: boolean;
  pollerActive: boolean;
  individualItems: { eventId?: string; entryTime?: string | null }[];
  teamItems: { eventId?: string; teamName?: string | null }[];
  notes: string | null;
  eventOptions: EventRow[];
  /** Stripe が発行するホスト領収書（Charge.receipt_url）。カード決済で取得できた場合のみ */
  stripeReceiptUrl: string | null;
  /** カード決済時の内訳（最新 Checkout レコードから推定） */
  cardPaymentBreakdown?: {
    entryFeeYen: number;
    processingFeeYen: number;
    totalChargedYen: number;
  };
  /** 表示用（決済手数料の率）。内訳があるときに付与 */
  cardProcessingFeeBps?: number;
};

function snapshotShape(data: unknown): {
  items?: { eventId?: string; entryTime?: string | null }[];
  teamEntries?: { eventId?: string; teamName?: string | null }[];
  notes?: string | null;
} | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  return data as {
    items?: { eventId?: string; entryTime?: string | null }[];
    teamEntries?: { eventId?: string; teamName?: string | null }[];
    notes?: string | null;
  };
}

/**
 * エントリー完了画面（旧 /entry/complete）と同一の表示用データを組み立てる。
 */
export function buildEntryCompletionReceipt(args: {
  competitionName: string;
  requireClubMembership: boolean;
  events: EventRow[];
  entry: EntryRow;
  sessionIdFromUrl: string | null | undefined;
}): EntryReceiptForClient {
  const { competitionName, requireClubMembership, events, entry, sessionIdFromUrl } = args;

  const sessionRecord = sessionIdFromUrl
    ? entry.checkoutSessions.find((r) => r.stripeCheckoutSessionId === sessionIdFromUrl)
    : entry.checkoutSessions[0];

  const entryState = getEntryUserFacingStatus({
    status: entry.status as CompetitionEntryStatus,
    totalFee: entry.totalFee,
    checkoutSessions: entry.checkoutSessions.map((s) => ({
      status: s.status as EntryCheckoutSessionStatus,
    })),
    clubIndividualFeePaidAt: entry.clubIndividualFeePaidAt ?? null,
  });

  const payload =
    sessionRecord?.payload && typeof sessionRecord.payload === "object"
      ? (sessionRecord.payload as Record<string, unknown>)
      : null;

  const userStatusForSession = getEntryUserFacingStatus({
    status: entry.status as CompetitionEntryStatus,
    totalFee: entry.totalFee,
    checkoutSessions: sessionRecord
      ? [{ status: sessionRecord.status as EntryCheckoutSessionStatus }]
      : [],
    clubIndividualFeePaidAt: entry.clubIndividualFeePaidAt ?? null,
  });

  let statusRow: EntryReceiptForClient["statusRow"];
  if (entry.status === "CANCELLED") {
    statusRow = {
      label:
        typeof payload?.refundedAt === "string" || entry.totalFee === 0
          ? "返金 / 取消済み"
          : "取消済み",
      icon: "check",
      tone: "gray",
    };
  } else if (userStatusForSession.businessEstablished) {
    statusRow = { label: userStatusForSession.userLabel, icon: "check", tone: "emerald" };
  } else {
    statusRow = { label: userStatusForSession.userLabel, icon: "clock", tone: "muted" };
  }

  const snap = snapshotShape(entry.snapshot?.data);
  const individualItems = Array.isArray(snap?.items)
    ? snap.items
    : entry.items.map((item) => ({
        eventId: item.eventId,
        entryTime: item.entryTime,
      }));
  const teamItems = Array.isArray(snap?.teamEntries) ? snap.teamEntries : [];

  const blurb =
    entry.status === "CANCELLED"
      ? `${competitionName} のエントリーは取消済みです。`
      : entryState.businessEstablished
        ? `${competitionName} へのエントリーは成立しました。`
        : `${competitionName} のエントリー手続きが完了しました（入金確認中）。`;

  const sessionStatus = sessionRecord?.status as EntryCheckoutSessionStatus | undefined;
  const clubBulkPaid = Boolean(entry.clubIndividualFeePaidAt);
  const showPaymentPendingBlock =
    entry.status !== "CANCELLED" &&
    entry.totalFee > 0 &&
    !clubBulkPaid &&
    !isEntryCheckoutPaidForEligibility(sessionStatus) &&
    sessionStatus !== "DISPUTE_LOST";

  const pollerActive =
    entry.status !== "CANCELLED" && entry.totalFee > 0 && !entryState.businessEstablished;

  const stripeReceiptUrl =
    entry.checkoutSessions.find(
      (s) =>
        isEntryCheckoutPaidForEligibility(s.status as EntryCheckoutSessionStatus) && s.stripeReceiptUrl
    )?.stripeReceiptUrl ?? null;

  const latestForBreakdown = sessionRecord ?? entry.checkoutSessions[0];
  const chargedYen =
    typeof latestForBreakdown?.amount === "number" && Number.isFinite(latestForBreakdown.amount)
      ? latestForBreakdown.amount
      : entry.totalFee;
  const cardPaymentBreakdown =
    entry.totalFee > 0 && chargedYen > entry.totalFee
      ? {
          entryFeeYen: entry.totalFee,
          processingFeeYen: chargedYen - entry.totalFee,
          totalChargedYen: chargedYen,
        }
      : undefined;
  const cardProcessingFeeBps = cardPaymentBreakdown
    ? getStripeProcessingFeeBpsFromEnv()
    : undefined;

  return {
    competitionName,
    blurb,
    entryId: entry.id,
    totalFee: entry.totalFee,
    requireClubMembership,
    clubName: entry.club?.name ?? null,
    statusRow,
    showPaymentPendingBlock,
    pollerActive,
    individualItems,
    teamItems,
    notes: snap?.notes ?? null,
    eventOptions: events.map((e) => ({ id: e.id, name: e.name, sex: e.sex })),
    stripeReceiptUrl,
    cardPaymentBreakdown,
    cardProcessingFeeBps,
  };
}
