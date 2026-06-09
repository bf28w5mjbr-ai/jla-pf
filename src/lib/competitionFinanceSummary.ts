import type { EntryCheckoutSessionStatus, PaymentStatus } from "@prisma/client";
import { applicationFeeAmountYen } from "@/lib/platformFee";
import { parseStripeBalanceTransactionFeeYen } from "@/lib/stripeBalanceTransactionFee";
import {
  getStripeProcessingFeeBpsFromEnv,
  stripeProcessingFeeSurchargeYenFromBps,
} from "@/lib/stripeProcessingFee";

export type CompetitionStripeFinanceSummary = {
  /** 1. 決済済総額（Checkout 請求合計・手数料込み） */
  settledGrossYen: number;
  individualGrossYen: number;
  teamGrossYen: number;
  /** 1b. 参加費 B のグロス（PF 計算用） */
  entryGrossYen: number;
  /** 2. 返金総額（Stripe 返金額・手数料込み） */
  refundTotalYen: number;
  individualRefundYen: number;
  teamRefundYen: number;
  /** 2b. 返金済み参加費 B（PF 計算用） */
  entryRefundYen: number;
  /** 3. 決済手数料（参加者負担・参考） */
  processingFeeYen: number;
  /** 4. PF手数料（返金分を差し引いた net） */
  platformFeeYen: number;
  /** PF グロス（返金前の参加費 B に対する PF） */
  platformFeeGrossYen: number;
  /** 返金に付随する PF */
  platformFeeRefundYen: number;
  /** 5. 実売上 = max(0, entryGross - entryRefund - PF) */
  netRevenueYen: number;
  /** 1. エントリー収入（参加費 B net） */
  entryIncomeNetYen: number;
  /** 上乗せ収益（返金後も残る S） */
  processingFeeCollectedYen: number;
  /** DB 保存の実 Stripe 手数料合計 */
  actualStripeFeeYen: number;
  /** 上乗せ − 実手数料（符号付き） */
  stripeProcessingSurplusYen: number;
  /** 実手数料が全決済分取得済みか */
  stripeFeeDataComplete: boolean;
  /** 実手数料集計対象の決済件数 */
  stripeFeeExpectedCount: number;
  /** 実手数料取得済み件数 */
  stripeFeeRecordedCount: number;
};

export type StripeOrphanRefundInput = {
  checkoutGrossYen: number;
  amountRefundedYen: number;
  entryFeeRefundedYen: number;
  stripeBalanceTransactionFeeYen?: number | null;
};

type StripeFeeTally = {
  actualStripeFeeYen: number;
  expectedCount: number;
  recordedCount: number;
};

function emptyStripeFeeTally(): StripeFeeTally {
  return { actualStripeFeeYen: 0, expectedCount: 0, recordedCount: 0 };
}

function addStripeFeeTally(
  tally: StripeFeeTally,
  payloadOrMetadata: unknown
): StripeFeeTally {
  tally.expectedCount += 1;
  const fee = parseStripeBalanceTransactionFeeYen(payloadOrMetadata);
  if (fee != null) {
    tally.actualStripeFeeYen += fee;
    tally.recordedCount += 1;
  }
  return tally;
}

export type IndividualEntryFinanceInput = {
  totalFee: number;
  status: string;
  clubIndividualFeePaidAt: Date | null;
  organizerManualPaidAt: Date | null;
  checkoutSessions: {
    status: EntryCheckoutSessionStatus;
    amount: number;
    payload: unknown;
  }[];
};

export type TeamPaymentFinanceInput = {
  status: PaymentStatus;
  amount: number;
  metadata: unknown;
};

type CheckoutPayload = {
  entryFeeYen: number | null;
  processingFeeYen: number | null;
  refundedAt: string | null;
  refundId: string | null;
  stripeRefundedEntryFeeYen: number | null;
  stripeAmountRefundedYen: number | null;
};

type StripeRefundedCheckoutMeta = {
  paymentIntentId: string;
  amountRefundedYen: number;
  entryFeeRefundedYen: number;
  checkoutGrossYen: number;
  stripeBalanceTransactionFeeYen: number | null;
};

function parseCheckoutPayload(payload: unknown): CheckoutPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      entryFeeYen: null,
      processingFeeYen: null,
      refundedAt: null,
      refundId: null,
      stripeRefundedEntryFeeYen: null,
      stripeAmountRefundedYen: null,
    };
  }
  const record = payload as Record<string, unknown>;
  const entryFeeRaw = record.entryFeeYen;
  const processingFeeRaw = record.processingFeeYen;
  const stripeRefundedRaw = record.stripeRefundedEntryFeeYen;
  const stripeAmountRaw = record.stripeAmountRefundedYen;
  return {
    entryFeeYen:
      typeof entryFeeRaw === "number" && Number.isFinite(entryFeeRaw) ? entryFeeRaw : null,
    processingFeeYen:
      typeof processingFeeRaw === "number" && Number.isFinite(processingFeeRaw)
        ? processingFeeRaw
        : null,
    refundedAt: typeof record.refundedAt === "string" ? record.refundedAt : null,
    refundId: typeof record.refundId === "string" ? record.refundId : null,
    stripeRefundedEntryFeeYen:
      typeof stripeRefundedRaw === "number" && Number.isFinite(stripeRefundedRaw)
        ? stripeRefundedRaw
        : null,
    stripeAmountRefundedYen:
      typeof stripeAmountRaw === "number" && Number.isFinite(stripeAmountRaw)
        ? stripeAmountRaw
        : null,
  };
}

function parseTeamPaymentMetadata(metadata: unknown): {
  processingFeeYen: number | null;
  stripeRefundedEntryFeeYen: number;
  stripeTotalAmountRefundedYen: number;
  stripeRefundedCheckouts: StripeRefundedCheckoutMeta[];
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {
      processingFeeYen: null,
      stripeRefundedEntryFeeYen: 0,
      stripeTotalAmountRefundedYen: 0,
      stripeRefundedCheckouts: [],
    };
  }
  const record = metadata as Record<string, unknown>;
  const processingFeeRaw = record.processingFeeYen;
  let processingFeeYen: number | null = null;
  if (typeof processingFeeRaw === "string") {
    const n = Number.parseInt(processingFeeRaw, 10);
    if (Number.isFinite(n) && n >= 0) processingFeeYen = n;
  } else if (typeof processingFeeRaw === "number" && Number.isFinite(processingFeeRaw) && processingFeeRaw >= 0) {
    processingFeeYen = processingFeeRaw;
  }

  const refundedRaw = record.stripeRefundedEntryFeeYen;
  const stripeRefundedEntryFeeYen =
    typeof refundedRaw === "number" && Number.isFinite(refundedRaw) && refundedRaw > 0
      ? refundedRaw
      : 0;

  const totalRefundedRaw = record.stripeTotalAmountRefundedYen;
  const stripeTotalAmountRefundedYen =
    typeof totalRefundedRaw === "number" && Number.isFinite(totalRefundedRaw) && totalRefundedRaw > 0
      ? totalRefundedRaw
      : typeof record.stripeAmountRefundedYen === "number" && Number.isFinite(record.stripeAmountRefundedYen)
        ? (record.stripeAmountRefundedYen as number)
        : 0;

  const stripeRefundedCheckouts: StripeRefundedCheckoutMeta[] = [];
  if (Array.isArray(record.stripeRefundedCheckouts)) {
    for (const row of record.stripeRefundedCheckouts) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const r = row as Record<string, unknown>;
      const paymentIntentId = typeof r.paymentIntentId === "string" ? r.paymentIntentId : null;
      if (!paymentIntentId) continue;
      stripeRefundedCheckouts.push({
        paymentIntentId,
        amountRefundedYen:
          typeof r.amountRefundedYen === "number" && Number.isFinite(r.amountRefundedYen)
            ? r.amountRefundedYen
            : 0,
        entryFeeRefundedYen:
          typeof r.entryFeeRefundedYen === "number" && Number.isFinite(r.entryFeeRefundedYen)
            ? r.entryFeeRefundedYen
            : 0,
        checkoutGrossYen:
          typeof r.checkoutGrossYen === "number" && Number.isFinite(r.checkoutGrossYen)
            ? r.checkoutGrossYen
            : 0,
        stripeBalanceTransactionFeeYen:
          typeof r.stripeBalanceTransactionFeeYen === "number" &&
          Number.isFinite(r.stripeBalanceTransactionFeeYen)
            ? r.stripeBalanceTransactionFeeYen
            : null,
      });
    }
  }

  return {
    processingFeeYen,
    stripeRefundedEntryFeeYen,
    stripeTotalAmountRefundedYen,
    stripeRefundedCheckouts,
  };
}

function parseTeamProcessingFeeYen(metadata: unknown, baseYen: number, bps: number): number {
  const parsed = parseTeamPaymentMetadata(metadata);
  if (parsed.processingFeeYen != null) return parsed.processingFeeYen;
  return stripeProcessingFeeSurchargeYenFromBps(baseYen, bps);
}

function individualSessionEntryFeeYen(
  session: IndividualEntryFinanceInput["checkoutSessions"][number],
  entryTotalFee: number
): number {
  const payload = parseCheckoutPayload(session.payload);
  const fee = payload.entryFeeYen ?? entryTotalFee;
  return fee > 0 ? fee : 0;
}

function individualSessionCheckoutGrossYen(
  session: IndividualEntryFinanceInput["checkoutSessions"][number],
  entryFeeYen: number,
  bps: number
): number {
  if (session.amount > 0) return session.amount;
  const payload = parseCheckoutPayload(session.payload);
  const processingFeeYen =
    payload.processingFeeYen ?? stripeProcessingFeeSurchargeYenFromBps(entryFeeYen, bps);
  return entryFeeYen + processingFeeYen;
}

function isIndividualStripeGrossSession(
  status: EntryCheckoutSessionStatus,
  payload: CheckoutPayload
): boolean {
  if (status === "COMPLETED" || status === "DISPUTED" || status === "DISPUTE_LOST") return true;
  return (
    payload.refundedAt != null ||
    payload.refundId != null ||
    (payload.stripeRefundedEntryFeeYen != null && payload.stripeRefundedEntryFeeYen > 0) ||
    (payload.stripeAmountRefundedYen != null && payload.stripeAmountRefundedYen > 0)
  );
}

function individualSessionEntryRefundYen(
  payload: CheckoutPayload,
  entryFeeYen: number,
  status: EntryCheckoutSessionStatus
): number {
  if (status === "DISPUTE_LOST") return entryFeeYen;
  if (payload.stripeRefundedEntryFeeYen != null && payload.stripeRefundedEntryFeeYen > 0) {
    return Math.min(entryFeeYen, payload.stripeRefundedEntryFeeYen);
  }
  if (payload.refundedAt != null || payload.refundId != null) return entryFeeYen;
  return 0;
}

function individualSessionCheckoutRefundYen(
  payload: CheckoutPayload,
  entryFeeYen: number,
  checkoutGrossYen: number,
  status: EntryCheckoutSessionStatus
): number {
  if (payload.stripeAmountRefundedYen != null && payload.stripeAmountRefundedYen > 0) {
    return payload.stripeAmountRefundedYen;
  }
  const entryRefund = individualSessionEntryRefundYen(payload, entryFeeYen, status);
  if (entryRefund <= 0) return 0;
  return checkoutGrossYen;
}

function entrySettledOnlyOutsideStripe(entry: IndividualEntryFinanceInput): boolean {
  const hasStripeGross = entry.checkoutSessions.some((s) => {
    const payload = parseCheckoutPayload(s.payload);
    return isIndividualStripeGrossSession(s.status, payload);
  });
  if (hasStripeGross) return false;
  return entry.clubIndividualFeePaidAt != null || entry.organizerManualPaidAt != null;
}

export function summarizeIndividualStripeFinance(
  entries: IndividualEntryFinanceInput[],
  processingFeeBps = getStripeProcessingFeeBpsFromEnv(),
  platformFeeBps?: number
): Pick<
  CompetitionStripeFinanceSummary,
  | "individualGrossYen"
  | "individualRefundYen"
  | "processingFeeYen"
  | "platformFeeYen"
  | "platformFeeGrossYen"
  | "platformFeeRefundYen"
  | "entryGrossYen"
  | "entryRefundYen"
> & { stripeFeeTally: StripeFeeTally } {
  let individualGrossYen = 0;
  let individualRefundYen = 0;
  let entryGrossYen = 0;
  let entryRefundYen = 0;
  let processingFeeYen = 0;
  let platformFeeGrossYen = 0;
  let platformFeeRefundYen = 0;
  const stripeFeeTally = emptyStripeFeeTally();

  for (const entry of entries) {
    if (entry.totalFee <= 0) continue;
    if (entrySettledOnlyOutsideStripe(entry)) continue;

    for (const session of entry.checkoutSessions) {
      const payload = parseCheckoutPayload(session.payload);
      if (!isIndividualStripeGrossSession(session.status, payload)) continue;

      const entryFeeYen = individualSessionEntryFeeYen(session, entry.totalFee);
      if (entryFeeYen <= 0) continue;

      const checkoutGrossYen = individualSessionCheckoutGrossYen(session, entryFeeYen, processingFeeBps);
      individualGrossYen += checkoutGrossYen;
      entryGrossYen += entryFeeYen;

      const checkoutRefundYen = individualSessionCheckoutRefundYen(
        payload,
        entryFeeYen,
        checkoutGrossYen,
        session.status
      );
      const entryRefund = individualSessionEntryRefundYen(payload, entryFeeYen, session.status);

      platformFeeGrossYen += applicationFeeAmountYen(entryFeeYen, platformFeeBps);
      addStripeFeeTally(stripeFeeTally, session.payload);

      if (checkoutRefundYen > 0) {
        individualRefundYen += checkoutRefundYen;
        entryRefundYen += entryRefund;
        if (entryRefund > 0) {
          platformFeeRefundYen += applicationFeeAmountYen(entryRefund, platformFeeBps);
        }
        continue;
      }

      processingFeeYen += Math.max(0, checkoutGrossYen - entryFeeYen);
    }
  }

  return {
    individualGrossYen,
    individualRefundYen,
    entryGrossYen,
    entryRefundYen,
    processingFeeYen,
    platformFeeYen: platformFeeGrossYen - platformFeeRefundYen,
    platformFeeGrossYen,
    platformFeeRefundYen,
    stripeFeeTally,
  };
}

export function summarizeTeamStripeFinance(
  payments: TeamPaymentFinanceInput[],
  processingFeeBps = getStripeProcessingFeeBpsFromEnv(),
  platformFeeBps?: number
): Pick<
  CompetitionStripeFinanceSummary,
  | "teamGrossYen"
  | "teamRefundYen"
  | "processingFeeYen"
  | "platformFeeYen"
  | "platformFeeGrossYen"
  | "platformFeeRefundYen"
  | "entryGrossYen"
  | "entryRefundYen"
> & { stripeFeeTally: StripeFeeTally } {
  let teamGrossYen = 0;
  let teamRefundYen = 0;
  let entryGrossYen = 0;
  let entryRefundYen = 0;
  let processingFeeYen = 0;
  let platformFeeGrossYen = 0;
  let platformFeeRefundYen = 0;
  const stripeFeeTally = emptyStripeFeeTally();

  for (const payment of payments) {
    if (payment.amount <= 0) continue;

    const meta = parseTeamPaymentMetadata(payment.metadata);
    const processingOnMain = parseTeamProcessingFeeYen(payment.metadata, payment.amount, processingFeeBps);
    const mainCheckoutGrossYen = payment.amount + processingOnMain;

    let duplicateCheckoutGrossYen = 0;
    for (const refunded of meta.stripeRefundedCheckouts) {
      duplicateCheckoutGrossYen += refunded.checkoutGrossYen;
      entryGrossYen += refunded.entryFeeRefundedYen;
      const pfOnRefunded = applicationFeeAmountYen(refunded.entryFeeRefundedYen, platformFeeBps);
      platformFeeGrossYen += pfOnRefunded;
      platformFeeRefundYen += pfOnRefunded;
      stripeFeeTally.expectedCount += 1;
      if (refunded.stripeBalanceTransactionFeeYen != null) {
        stripeFeeTally.actualStripeFeeYen += refunded.stripeBalanceTransactionFeeYen;
        stripeFeeTally.recordedCount += 1;
      }
    }

    if (
      payment.status === "SUCCEEDED" ||
      payment.status === "DISPUTED" ||
      payment.status === "REFUNDED"
    ) {
      teamGrossYen += mainCheckoutGrossYen + duplicateCheckoutGrossYen;
      entryGrossYen += payment.amount;
    }

    if (payment.status === "REFUNDED") {
      teamRefundYen += mainCheckoutGrossYen;
      entryRefundYen += payment.amount;
      platformFeeGrossYen += applicationFeeAmountYen(payment.amount, platformFeeBps);
      platformFeeRefundYen += applicationFeeAmountYen(payment.amount, platformFeeBps);
      addStripeFeeTally(stripeFeeTally, payment.metadata);
      continue;
    }

    const checkoutRefundYen =
      meta.stripeTotalAmountRefundedYen > 0
        ? meta.stripeTotalAmountRefundedYen
        : meta.stripeRefundedEntryFeeYen > 0
          ? duplicateCheckoutGrossYen || meta.stripeRefundedEntryFeeYen + processingOnMain
          : 0;

    if (checkoutRefundYen > 0) {
      teamRefundYen += checkoutRefundYen;
      entryRefundYen += meta.stripeRefundedEntryFeeYen;
    }

    if (payment.status === "SUCCEEDED" || payment.status === "DISPUTED") {
      processingFeeYen += processingOnMain;
      platformFeeGrossYen += applicationFeeAmountYen(payment.amount, platformFeeBps);
      addStripeFeeTally(stripeFeeTally, payment.metadata);
    }
  }

  return {
    teamGrossYen,
    teamRefundYen,
    entryGrossYen,
    entryRefundYen,
    processingFeeYen,
    platformFeeYen: platformFeeGrossYen - platformFeeRefundYen,
    platformFeeGrossYen,
    platformFeeRefundYen,
    stripeFeeTally,
  };
}

export function summarizeCompetitionStripeFinance(args: {
  entries: IndividualEntryFinanceInput[];
  teamPayments: TeamPaymentFinanceInput[];
  stripeOrphanRefunds?: StripeOrphanRefundInput[];
  processingFeeBps?: number;
  platformFeeBps?: number;
}): CompetitionStripeFinanceSummary {
  const processingFeeBps = args.processingFeeBps ?? getStripeProcessingFeeBpsFromEnv();
  const platformFeeBps = args.platformFeeBps;

  const individual = summarizeIndividualStripeFinance(
    args.entries,
    processingFeeBps,
    platformFeeBps
  );
  const team = summarizeTeamStripeFinance(args.teamPayments, processingFeeBps, platformFeeBps);

  let orphanCheckoutGross = 0;
  let orphanRefundCheckout = 0;
  let orphanEntryGross = 0;
  let orphanEntryRefund = 0;
  let orphanPlatformFeeGross = 0;
  let orphanPlatformFeeRefund = 0;
  for (const orphan of args.stripeOrphanRefunds ?? []) {
    orphanCheckoutGross += orphan.checkoutGrossYen;
    orphanRefundCheckout += orphan.amountRefundedYen;
    orphanEntryGross += orphan.entryFeeRefundedYen;
    orphanEntryRefund += orphan.entryFeeRefundedYen;
    const pfOnOrphan = applicationFeeAmountYen(orphan.entryFeeRefundedYen, platformFeeBps);
    orphanPlatformFeeGross += pfOnOrphan;
    orphanPlatformFeeRefund += pfOnOrphan;
  }

  const settledGrossYen =
    individual.individualGrossYen + team.teamGrossYen + orphanCheckoutGross;
  const refundTotalYen =
    individual.individualRefundYen + team.teamRefundYen + orphanRefundCheckout;
  const entryGrossYen = individual.entryGrossYen + team.entryGrossYen + orphanEntryGross;
  const entryRefundYen = individual.entryRefundYen + team.entryRefundYen + orphanEntryRefund;
  const processingFeeYen = individual.processingFeeYen + team.processingFeeYen;
  const platformFeeGrossYen =
    individual.platformFeeGrossYen + team.platformFeeGrossYen + orphanPlatformFeeGross;
  const platformFeeRefundYen =
    individual.platformFeeRefundYen + team.platformFeeRefundYen + orphanPlatformFeeRefund;
  const platformFeeYen = platformFeeGrossYen - platformFeeRefundYen;
  const entryIncomeNetYen = entryGrossYen - entryRefundYen;
  const netRevenueYen = Math.max(0, entryIncomeNetYen - platformFeeYen);
  const processingFeeCollectedYen = processingFeeYen;

  let stripeFeeExpectedCount =
    individual.stripeFeeTally.expectedCount + team.stripeFeeTally.expectedCount;
  let stripeFeeRecordedCount =
    individual.stripeFeeTally.recordedCount + team.stripeFeeTally.recordedCount;
  let actualStripeFeeYen =
    individual.stripeFeeTally.actualStripeFeeYen + team.stripeFeeTally.actualStripeFeeYen;

  for (const orphan of args.stripeOrphanRefunds ?? []) {
    stripeFeeExpectedCount += 1;
    if (
      orphan.stripeBalanceTransactionFeeYen != null &&
      Number.isFinite(orphan.stripeBalanceTransactionFeeYen)
    ) {
      actualStripeFeeYen += orphan.stripeBalanceTransactionFeeYen;
      stripeFeeRecordedCount += 1;
    }
  }

  const stripeProcessingSurplusYen = processingFeeCollectedYen - actualStripeFeeYen;
  const stripeFeeDataComplete =
    stripeFeeExpectedCount === 0 || stripeFeeExpectedCount === stripeFeeRecordedCount;

  return {
    settledGrossYen,
    individualGrossYen: individual.individualGrossYen,
    teamGrossYen: team.teamGrossYen,
    entryGrossYen,
    refundTotalYen,
    individualRefundYen: individual.individualRefundYen,
    teamRefundYen: team.teamRefundYen,
    entryRefundYen,
    processingFeeYen,
    platformFeeYen,
    platformFeeGrossYen,
    platformFeeRefundYen,
    netRevenueYen,
    entryIncomeNetYen,
    processingFeeCollectedYen,
    actualStripeFeeYen,
    stripeProcessingSurplusYen,
    stripeFeeDataComplete,
    stripeFeeExpectedCount,
    stripeFeeRecordedCount,
  };
}
