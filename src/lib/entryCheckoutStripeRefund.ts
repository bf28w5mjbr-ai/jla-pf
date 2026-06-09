import type Stripe from "stripe";
import { prisma } from "@/server/db";
import { logAuditAction } from "@/lib/auditLog";
import {
  fetchStripeBalanceTransactionFeeYen,
} from "@/lib/stripeBalanceTransactionFee";
import { stripe } from "@/lib/stripe";

function paymentIntentIdFromCharge(charge: Stripe.Charge): string | null {
  const ref = charge.payment_intent;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

function parsePayloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

export type StripeRefundState = {
  amountRefundedYen: number;
  fullyRefunded: boolean;
  chargeId: string | null;
  refundId: string | null;
};

/** 返金額（Stripe charge.amount_refunded）から参加費 B 分の返金を推定 */
export function refundedEntryFeeYenFromCharge(args: {
  amountRefundedYen: number;
  entryFeeYen: number;
  processingFeeYen: number;
  fullyRefunded: boolean;
}): number {
  const { amountRefundedYen, entryFeeYen, processingFeeYen, fullyRefunded } = args;
  if (entryFeeYen <= 0 || amountRefundedYen <= 0) return 0;
  if (fullyRefunded || amountRefundedYen >= entryFeeYen + processingFeeYen) {
    return entryFeeYen;
  }
  const entryPortion = amountRefundedYen - processingFeeYen;
  if (entryPortion <= 0) return 0;
  return Math.min(entryFeeYen, entryPortion);
}

export function buildRefundedCheckoutPayloadFromState(args: {
  currentPayload: unknown;
  refundState: StripeRefundState;
  entryFeeYen: number;
  processingFeeYen: number;
}): Record<string, unknown> {
  const current = parsePayloadRecord(args.currentPayload);
  const entryFeeRefundedYen = refundedEntryFeeYenFromCharge({
    amountRefundedYen: args.refundState.amountRefundedYen,
    entryFeeYen: args.entryFeeYen,
    processingFeeYen: args.processingFeeYen,
    fullyRefunded: args.refundState.fullyRefunded,
  });
  const syncedAt = new Date().toISOString();

  return {
    ...current,
    refundedAt:
      typeof current.refundedAt === "string"
        ? current.refundedAt
        : entryFeeRefundedYen > 0
          ? syncedAt
          : (current.refundedAt ?? null),
    refundId:
      typeof current.refundId === "string"
        ? current.refundId
        : args.refundState.refundId ?? current.refundId ?? null,
    stripeAmountRefundedYen: args.refundState.amountRefundedYen,
    stripeRefundedEntryFeeYen: entryFeeRefundedYen,
    stripeRefundSyncedAt: syncedAt,
  };
}

export function buildRefundedCheckoutPayload(args: {
  currentPayload: unknown;
  charge: Stripe.Charge;
  entryFeeYen: number;
  processingFeeYen: number;
}): Record<string, unknown> {
  return buildRefundedCheckoutPayloadFromState({
    currentPayload: args.currentPayload,
    refundState: {
      amountRefundedYen: args.charge.amount_refunded ?? 0,
      fullyRefunded: args.charge.refunded === true,
      chargeId: args.charge.id,
      refundId: args.charge.refunds?.data?.[0]?.id ?? null,
    },
    entryFeeYen: args.entryFeeYen,
    processingFeeYen: args.processingFeeYen,
  });
}

async function retrieveConnectCharge(
  chargeId: string,
  connectAccountId: string
): Promise<Stripe.Charge> {
  return stripe.charges.retrieve(chargeId, { expand: ["refunds"] }, { stripeAccount: connectAccountId });
}

/**
 * プラットフォーム PI から返金状態を解決する。
 * Connect ダッシュボード返金（送金先 py_ の返金・transfer reversal）も考慮する。
 */
export async function resolveRefundStateForPaymentIntent(
  paymentIntentId: string,
  connectAccountId: string | null
): Promise<StripeRefundState | null> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.transfer"],
  });
  const charge = pi.latest_charge;
  if (!charge || typeof charge === "string") return null;

  let amountRefundedYen = charge.amount_refunded ?? 0;
  let fullyRefunded = charge.refunded === true;
  let refundId = charge.refunds?.data?.[0]?.id ?? null;

  const transfer = charge.transfer;
  if (transfer && typeof transfer === "object") {
    const amountReversed = transfer.amount_reversed ?? 0;
    if (amountReversed > amountRefundedYen) {
      amountRefundedYen = amountReversed;
    }
    if (transfer.reversed || amountReversed >= transfer.amount) {
      fullyRefunded = true;
    }

    if (connectAccountId && typeof transfer.destination_payment === "string") {
      try {
        const destCharge = await retrieveConnectCharge(
          transfer.destination_payment,
          connectAccountId
        );
        const destRefunded = destCharge.amount_refunded ?? 0;
        if (destRefunded > amountRefundedYen) {
          amountRefundedYen = destRefunded;
        }
        if (destCharge.refunded) {
          fullyRefunded = true;
        }
        if (!refundId && destCharge.refunds?.data?.[0]?.id) {
          refundId = destCharge.refunds.data[0].id;
        }
      } catch {
        // Connect 側参照失敗時はプラットフォーム charge / transfer のみ
      }
    }
  }

  if (amountRefundedYen <= 0) return null;
  return {
    amountRefundedYen,
    fullyRefunded,
    chargeId: charge.id,
    refundId,
  };
}

export type EntryCheckoutRefundApplyResult = {
  updatedCheckoutSessions: number;
};

type StripeRefundedCheckoutRecord = {
  paymentIntentId: string;
  amountRefundedYen: number;
  entryFeeRefundedYen: number;
  checkoutGrossYen: number;
  stripeBalanceTransactionFeeYen?: number;
};

function parseStripeRefundedCheckouts(metadata: unknown): StripeRefundedCheckoutRecord[] {
  const record = parsePayloadRecord(metadata);
  if (!Array.isArray(record.stripeRefundedCheckouts)) return [];
  const rows: StripeRefundedCheckoutRecord[] = [];
  for (const row of record.stripeRefundedCheckouts) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const paymentIntentId = typeof r.paymentIntentId === "string" ? r.paymentIntentId : null;
    if (!paymentIntentId) continue;
    rows.push({
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
    });
  }
  return rows;
}

async function resolvePlatformPaymentIntentFromConnectCharge(
  connectCharge: Stripe.Charge,
  connectAccountId: string
): Promise<string | null> {
  let paymentIntentId = paymentIntentIdFromCharge(connectCharge);
  if (paymentIntentId) return paymentIntentId;

  const sourceTransfer = connectCharge.source_transfer;
  const transferId =
    typeof sourceTransfer === "string" ? sourceTransfer : sourceTransfer?.id ?? null;
  if (!transferId) return null;

  try {
    const transfer = await stripe.transfers.retrieve(transferId, {
      expand: ["source_transaction"],
    });
    const sourceTx = transfer.source_transaction;
    const platformChargeId = typeof sourceTx === "string" ? sourceTx : sourceTx?.id ?? null;
    if (!platformChargeId) return null;
    const platformCharge = await stripe.charges.retrieve(platformChargeId);
    return paymentIntentIdFromCharge(platformCharge);
  } catch {
    return null;
  }
}

async function applyRefundFromCheckoutMetadata(
  paymentIntentId: string,
  refundState: StripeRefundState,
  competitionId?: string
): Promise<number> {
  const checkoutList = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 10,
  });

  let updated = 0;
  for (const cs of checkoutList.data) {
    const meta = cs.metadata ?? {};
    if (competitionId && meta.competitionId !== competitionId) continue;
    const paymentId = meta.paymentId;
    const entryCheckoutSessionId = meta.entryCheckoutSessionId;
    const entryId = meta.entryId;
    const entryFeeYen = Number.parseInt(meta.entryFeeYen ?? "", 10);
    const processingFeeYen = Number.parseInt(meta.processingFeeYen ?? "", 10);
    const baseEntryFee =
      Number.isFinite(entryFeeYen) && entryFeeYen > 0 ? entryFeeYen : 0;
    const baseProcessingFee =
      Number.isFinite(processingFeeYen) && processingFeeYen >= 0 ? processingFeeYen : 0;
    const checkoutGrossYen =
      cs.amount_total ?? (baseEntryFee > 0 ? baseEntryFee + baseProcessingFee : refundState.amountRefundedYen);

    const entryFeeRefunded = refundedEntryFeeYenFromCharge({
      amountRefundedYen: refundState.amountRefundedYen,
      entryFeeYen: baseEntryFee,
      processingFeeYen: baseProcessingFee,
      fullyRefunded: refundState.fullyRefunded,
    });

    if (entryFeeRefunded <= 0 && refundState.amountRefundedYen <= 0) continue;

    if (paymentId) {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { id: true, metadata: true, stripePaymentIntentId: true, status: true },
      });
      if (!payment) continue;

      const currentMeta = parsePayloadRecord(payment.metadata);
      const prevCheckouts = parseStripeRefundedCheckouts(payment.metadata);
      if (prevCheckouts.some((row) => row.paymentIntentId === paymentIntentId)) continue;

      const refundedPiFee = await fetchStripeBalanceTransactionFeeYen(paymentIntentId);
      const nextCheckouts: StripeRefundedCheckoutRecord[] = [
        ...prevCheckouts,
        {
          paymentIntentId,
          amountRefundedYen: refundState.amountRefundedYen,
          entryFeeRefundedYen: entryFeeRefunded,
          checkoutGrossYen,
          ...(refundedPiFee != null ? { stripeBalanceTransactionFeeYen: refundedPiFee } : {}),
        },
      ];
      const stripeRefundedEntryFeeYen = nextCheckouts.reduce(
        (sum, row) => sum + row.entryFeeRefundedYen,
        0
      );
      const stripeTotalAmountRefundedYen = nextCheckouts.reduce(
        (sum, row) => sum + row.amountRefundedYen,
        0
      );
      const mainPiRefunded = payment.stripePaymentIntentId === paymentIntentId;

      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status:
            mainPiRefunded && refundState.fullyRefunded ? "REFUNDED" : payment.status,
          metadata: {
            ...currentMeta,
            stripeRefundedCheckouts: nextCheckouts,
            stripeRefundedEntryFeeYen,
            stripeTotalAmountRefundedYen,
            stripeAmountRefundedYen: stripeTotalAmountRefundedYen,
            stripeRefundSyncedAt: new Date().toISOString(),
            stripeRefundedPaymentIntentIds: nextCheckouts.map((row) => row.paymentIntentId),
          },
        },
      });
      updated += 1;
      continue;
    }

    let session =
      entryCheckoutSessionId != null
        ? await prisma.entryCheckoutSession.findUnique({
            where: { id: entryCheckoutSessionId },
            select: { id: true, payload: true, entry: { select: { totalFee: true } } },
          })
        : null;

    if (!session && typeof entryId === "string" && meta.competitionId) {
      session = await prisma.entryCheckoutSession.findFirst({
        where: { entryId, competitionId: meta.competitionId },
        orderBy: { createdAt: "desc" },
        select: { id: true, payload: true, entry: { select: { totalFee: true } } },
      });
    }

    if (!session) {
      session = await prisma.entryCheckoutSession.findFirst({
        where: { stripePaymentIntentId: paymentIntentId },
        select: { id: true, payload: true, entry: { select: { totalFee: true } } },
      });
    }

    if (!session) continue;

    const current = parsePayloadRecord(session.payload);
    if (
      typeof current.stripeAmountRefundedYen === "number" &&
      current.stripeAmountRefundedYen >= refundState.amountRefundedYen
    ) {
      continue;
    }

    const fee = baseEntryFee > 0 ? baseEntryFee : session.entry.totalFee;
    const proc =
      baseProcessingFee > 0
        ? baseProcessingFee
        : typeof current.processingFeeYen === "number"
          ? current.processingFeeYen
          : 0;

    await prisma.entryCheckoutSession.update({
      where: { id: session.id },
      data: {
        payload: buildRefundedCheckoutPayloadFromState({
          currentPayload: session.payload,
          refundState,
          entryFeeYen: fee,
          processingFeeYen: proc,
        }),
      },
    });
    updated += 1;
  }

  return updated;
}

export type CompetitionStripeOrphanRefund = {
  paymentIntentId: string | null;
  checkoutGrossYen: number;
  amountRefundedYen: number;
  entryFeeRefundedYen: number;
  stripeBalanceTransactionFeeYen: number | null;
};

/** DB に紐づかない Connect 返金（削除済みエントリー等）を Stripe から取得 */
export async function listCompetitionStripeConnectOrphanRefunds(
  competitionId: string,
  connectAccountId: string
): Promise<CompetitionStripeOrphanRefund[]> {
  const orphans: CompetitionStripeOrphanRefund[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const page = await stripe.refunds.list(
      { limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) },
      { stripeAccount: connectAccountId }
    );

    for (const refund of page.data) {
      const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
      if (!chargeId) continue;

      let connectCharge: Stripe.Charge;
      try {
        connectCharge = await retrieveConnectCharge(chargeId, connectAccountId);
      } catch {
        continue;
      }

      const paymentIntentId = await resolvePlatformPaymentIntentFromConnectCharge(
        connectCharge,
        connectAccountId
      );
      if (!paymentIntentId) continue;

      const checkoutList = await stripe.checkout.sessions.list({
        payment_intent: paymentIntentId,
        limit: 5,
      });
      const cs = checkoutList.data.find((row) => row.metadata?.competitionId === competitionId);
      if (!cs) continue;

      const meta = cs.metadata ?? {};
      const entryFeeYen = Number.parseInt(meta.entryFeeYen ?? "", 10);
      const processingFeeYen = Number.parseInt(meta.processingFeeYen ?? "", 10);
      const baseEntryFee =
        Number.isFinite(entryFeeYen) && entryFeeYen > 0 ? entryFeeYen : 0;
      const baseProcessingFee =
        Number.isFinite(processingFeeYen) && processingFeeYen >= 0 ? processingFeeYen : 0;
      const refundState: StripeRefundState = {
        amountRefundedYen: refund.amount,
        fullyRefunded: refund.amount >= (cs.amount_total ?? refund.amount),
        chargeId: connectCharge.id,
        refundId: refund.id,
      };
      const entryFeeRefunded =
        baseEntryFee > 0
          ? refundedEntryFeeYenFromCharge({
              amountRefundedYen: refund.amount,
              entryFeeYen: baseEntryFee,
              processingFeeYen: baseProcessingFee,
              fullyRefunded: refundState.fullyRefunded,
            })
          : refund.amount;
      const checkoutGrossYen = cs.amount_total ?? refund.amount;

      let matchedInDb = false;
      if (meta.paymentId) {
        const payment = await prisma.payment.findUnique({
          where: { id: meta.paymentId },
          select: { metadata: true },
        });
        if (payment) {
          const rows = parseStripeRefundedCheckouts(payment.metadata);
          matchedInDb = rows.some((row) => row.paymentIntentId === paymentIntentId);
        }
      } else {
        const session = await prisma.entryCheckoutSession.findFirst({
          where: {
            OR: [
              { stripePaymentIntentId: paymentIntentId },
              ...(typeof meta.entryCheckoutSessionId === "string"
                ? [{ id: meta.entryCheckoutSessionId }]
                : []),
            ],
          },
          select: { payload: true },
        });
        if (session) {
          const payload = parsePayloadRecord(session.payload);
          matchedInDb =
            typeof payload.stripeAmountRefundedYen === "number" &&
            payload.stripeAmountRefundedYen > 0;
        }
      }

      if (matchedInDb) continue;

      const orphanFee =
        paymentIntentId != null
          ? await fetchStripeBalanceTransactionFeeYen(paymentIntentId)
          : null;

      orphans.push({
        paymentIntentId,
        checkoutGrossYen,
        amountRefundedYen: refund.amount,
        entryFeeRefundedYen: entryFeeRefunded,
        stripeBalanceTransactionFeeYen: orphanFee,
      });
    }

    hasMore = page.has_more;
    startingAfter = page.data.at(-1)?.id;
    if (!startingAfter) break;
  }

  return orphans;
}

async function paymentIntentBelongsToCompetition(
  paymentIntentId: string,
  competitionId: string
): Promise<boolean> {
  const [entrySession, teamPayment] = await Promise.all([
    prisma.entryCheckoutSession.findFirst({
      where: { stripePaymentIntentId: paymentIntentId, competitionId },
      select: { id: true },
    }),
    prisma.payment.findFirst({
      where: {
        stripePaymentIntentId: paymentIntentId,
        type: "COMPETITION_ENTRY_FEE",
      },
      select: { ownerId: true, metadata: true },
    }),
  ]);
  if (entrySession) return true;
  if (teamPayment) {
    const meta = parsePayloadRecord(teamPayment.metadata);
    if (meta.competitionId === competitionId) return true;
    if (teamPayment.ownerId.includes(competitionId)) return true;
  }

  const checkoutList = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 10,
  });
  for (const cs of checkoutList.data) {
    if (cs.metadata?.competitionId === competitionId) return true;
  }

  return false;
}

async function markEntryCheckoutSessionsRefundChecked(
  paymentIntentId: string
): Promise<void> {
  const sessions = await prisma.entryCheckoutSession.findMany({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true, payload: true },
  });
  const checkedAt = new Date().toISOString();
  for (const session of sessions) {
    const current = parsePayloadRecord(session.payload);
    if (typeof current.stripeRefundCheckedAt === "string") continue;
    await prisma.entryCheckoutSession.update({
      where: { id: session.id },
      data: {
        payload: {
          ...current,
          stripeRefundCheckedAt: checkedAt,
        },
      },
    });
  }
}

export async function applyStripeRefundToPaymentIntent(
  paymentIntentId: string,
  refundState: StripeRefundState
): Promise<EntryCheckoutRefundApplyResult> {
  const sessions = await prisma.entryCheckoutSession.findMany({
    where: { stripePaymentIntentId: paymentIntentId },
    select: {
      id: true,
      payload: true,
      competitionId: true,
      entryId: true,
      entry: { select: { totalFee: true } },
    },
  });

  let updated = 0;
  for (const session of sessions) {
    const current = parsePayloadRecord(session.payload);
    const entryFeeYen =
      typeof current.entryFeeYen === "number" && Number.isFinite(current.entryFeeYen)
        ? current.entryFeeYen
        : session.entry.totalFee;
    const processingFeeYen =
      typeof current.processingFeeYen === "number" && Number.isFinite(current.processingFeeYen)
        ? current.processingFeeYen
        : 0;

    const nextPayload = buildRefundedCheckoutPayloadFromState({
      currentPayload: session.payload,
      refundState,
      entryFeeYen,
      processingFeeYen,
    });

    const prevRefunded =
      typeof current.stripeRefundedEntryFeeYen === "number"
        ? current.stripeRefundedEntryFeeYen
        : typeof current.refundedAt === "string"
          ? entryFeeYen
          : 0;
    const nextRefunded =
      typeof nextPayload.stripeRefundedEntryFeeYen === "number"
        ? nextPayload.stripeRefundedEntryFeeYen
        : 0;

    if (nextRefunded <= 0 && prevRefunded <= 0) continue;

    await prisma.entryCheckoutSession.update({
      where: { id: session.id },
      data: { payload: nextPayload },
    });
    updated += 1;

    void logAuditAction({
      action: "ENTRY_CHECKOUT_STRIPE_REFUND_SYNCED",
      actorType: "SYSTEM",
      actorKey: "system:stripe_webhook",
      targetType: "EntryCheckoutSession",
      targetId: session.id,
      targetKey: `competition:${session.competitionId}`,
      metadata: {
        paymentIntentId,
        entryId: session.entryId,
        stripeAmountRefundedYen: refundState.amountRefundedYen,
        stripeRefundedEntryFeeYen: nextRefunded,
        chargeId: refundState.chargeId,
      },
      result: "SUCCESS",
    });
  }

  if (refundState.amountRefundedYen > 0) {
    const payments = await prisma.payment.findMany({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { id: true, status: true },
    });
    for (const payment of payments) {
      if (payment.status === "REFUNDED") continue;
      if (refundState.fullyRefunded) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "REFUNDED" },
        });
      }
    }
  }

  return { updatedCheckoutSessions: updated };
}

export async function applyStripeRefundToEntryCheckoutSessions(
  charge: Stripe.Charge
): Promise<EntryCheckoutRefundApplyResult> {
  const paymentIntentId = paymentIntentIdFromCharge(charge);
  if (!paymentIntentId || (charge.amount_refunded ?? 0) <= 0) {
    return { updatedCheckoutSessions: 0 };
  }

  return applyStripeRefundToPaymentIntent(paymentIntentId, {
    amountRefundedYen: charge.amount_refunded ?? 0,
    fullyRefunded: charge.refunded === true,
    chargeId: charge.id,
    refundId: charge.refunds?.data?.[0]?.id ?? null,
  });
}

export async function applyStripeConnectDestinationRefund(
  connectCharge: Stripe.Charge,
  connectAccountId: string
): Promise<EntryCheckoutRefundApplyResult> {
  if ((connectCharge.amount_refunded ?? 0) <= 0) return { updatedCheckoutSessions: 0 };

  let paymentIntentId = paymentIntentIdFromCharge(connectCharge);

  if (!paymentIntentId) {
    const sourceTransfer = connectCharge.source_transfer;
    const transferId =
      typeof sourceTransfer === "string" ? sourceTransfer : sourceTransfer?.id ?? null;
    if (transferId) {
      try {
        const transfer = await stripe.transfers.retrieve(transferId, {
          expand: ["source_transaction"],
        });
        const sourceTx = transfer.source_transaction;
        const platformChargeId =
          typeof sourceTx === "string" ? sourceTx : sourceTx?.id ?? null;
        if (platformChargeId) {
          const platformCharge = await stripe.charges.retrieve(platformChargeId);
          paymentIntentId = paymentIntentIdFromCharge(platformCharge);
        }
      } catch {
        return { updatedCheckoutSessions: 0 };
      }
    }
  }

  if (!paymentIntentId) return { updatedCheckoutSessions: 0 };

  return applyStripeRefundToPaymentIntent(paymentIntentId, {
    amountRefundedYen: connectCharge.amount_refunded ?? 0,
    fullyRefunded: connectCharge.refunded === true,
    chargeId: connectCharge.id,
    refundId: connectCharge.refunds?.data?.[0]?.id ?? null,
  });
}

async function syncConnectAccountRefundsForCompetition(
  competitionId: string,
  connectAccountId: string
): Promise<number> {
  let updated = 0;
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const page = await stripe.refunds.list(
      { limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) },
      { stripeAccount: connectAccountId }
    );

    for (const refund of page.data) {
      const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
      if (!chargeId) continue;

      let connectCharge: Stripe.Charge;
      try {
        connectCharge = await retrieveConnectCharge(chargeId, connectAccountId);
      } catch {
        continue;
      }

      let paymentIntentId = paymentIntentIdFromCharge(connectCharge);
      if (!paymentIntentId) {
        const sourceTransfer = connectCharge.source_transfer;
        const transferId =
          typeof sourceTransfer === "string" ? sourceTransfer : sourceTransfer?.id ?? null;
        if (transferId) {
          try {
            const transfer = await stripe.transfers.retrieve(transferId, {
              expand: ["source_transaction"],
            });
            const sourceTx = transfer.source_transaction;
            const platformChargeId =
              typeof sourceTx === "string" ? sourceTx : sourceTx?.id ?? null;
            if (platformChargeId) {
              const platformCharge = await stripe.charges.retrieve(platformChargeId);
              paymentIntentId = paymentIntentIdFromCharge(platformCharge);
            }
          } catch {
            continue;
          }
        }
      }

      if (!paymentIntentId) continue;

      const refundStateForCheckout: StripeRefundState = {
        amountRefundedYen: connectCharge.amount_refunded ?? 0,
        fullyRefunded: connectCharge.refunded === true,
        chargeId: connectCharge.id,
        refundId: connectCharge.refunds?.data?.[0]?.id ?? null,
      };
      updated += await applyRefundFromCheckoutMetadata(
        paymentIntentId,
        refundStateForCheckout,
        competitionId
      );

      if (!(await paymentIntentBelongsToCompetition(paymentIntentId, competitionId))) continue;

      const result = await applyStripeConnectDestinationRefund(connectCharge, connectAccountId);
      updated += result.updatedCheckoutSessions;
    }

    hasMore = page.has_more;
    startingAfter = page.data.at(-1)?.id;
    if (!startingAfter) break;
  }

  return updated;
}

async function syncPlatformRefundsForCompetition(competitionId: string): Promise<number> {
  const competitionPaymentIntentIds = new Set(
    (
      await prisma.entryCheckoutSession.findMany({
        where: { competitionId, stripePaymentIntentId: { not: null } },
        select: { stripePaymentIntentId: true },
      })
    )
      .map((s) => s.stripePaymentIntentId)
      .filter((id): id is string => Boolean(id))
  );

  const teamPayments = await prisma.payment.findMany({
    where: {
      type: "COMPETITION_ENTRY_FEE",
      stripePaymentIntentId: { not: null },
      metadata: { path: ["competitionId"], equals: competitionId },
    },
    select: { stripePaymentIntentId: true },
  });
  for (const p of teamPayments) {
    if (p.stripePaymentIntentId) competitionPaymentIntentIds.add(p.stripePaymentIntentId);
  }

  let updated = 0;
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const page = await stripe.refunds.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const refund of page.data) {
      const piId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
      if (!piId || !competitionPaymentIntentIds.has(piId)) continue;

      const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
      if (!chargeId) continue;

      try {
        const charge = await stripe.charges.retrieve(chargeId, { expand: ["refunds"] });
        updated += await applyRefundFromCheckoutMetadata(
          piId,
          {
            amountRefundedYen: charge.amount_refunded ?? 0,
            fullyRefunded: charge.refunded === true,
            chargeId: charge.id,
            refundId: charge.refunds?.data?.[0]?.id ?? null,
          },
          competitionId
        );
        const result = await applyStripeRefundToEntryCheckoutSessions(charge);
        updated += result.updatedCheckoutSessions;
      } catch {
        continue;
      }
    }

    hasMore = page.has_more;
    startingAfter = page.data.at(-1)?.id;
    if (!startingAfter) break;
  }

  return updated;
}

/** Stripe 返金を DB に同期（大会単位）。事業収支タブ表示時・バックフィル用。 */
export async function reconcileCompetitionEntryCheckoutRefundsFromStripe(
  competitionId: string,
  options?: { maxPiScans?: number }
): Promise<{ scanned: number; updated: number }> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      organization: { select: { stripeConnectAccountId: true } },
    },
  });
  const connectAccountId = competition?.organization.stripeConnectAccountId ?? null;

  let updated = 0;

  if (connectAccountId) {
    updated += await syncConnectAccountRefundsForCompetition(competitionId, connectAccountId);
  }
  updated += await syncPlatformRefundsForCompetition(competitionId);

  const sessions = await prisma.entryCheckoutSession.findMany({
    where: {
      competitionId,
      stripePaymentIntentId: { not: null },
      status: { in: ["COMPLETED", "DISPUTED", "DISPUTE_LOST"] },
    },
    select: { stripePaymentIntentId: true, payload: true },
  });

  const paymentIntentIds = [
    ...new Set(
      sessions
        .filter((s) => {
          const record = parsePayloadRecord(s.payload);
          if (typeof record.stripeRefundSyncedAt === "string") return false;
          if (typeof record.stripeRefundCheckedAt === "string") return false;
          if (typeof record.refundedAt === "string" && typeof record.refundId === "string") {
            return false;
          }
          return true;
        })
        .map((s) => s.stripePaymentIntentId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const piScanLimit = options?.maxPiScans ?? paymentIntentIds.length;
  const piIdsToScan = paymentIntentIds.slice(0, piScanLimit);

  for (const paymentIntentId of piIdsToScan) {
    const refundState = await resolveRefundStateForPaymentIntent(
      paymentIntentId,
      connectAccountId
    );
    if (refundState) {
      const result = await applyStripeRefundToPaymentIntent(paymentIntentId, refundState);
      updated += result.updatedCheckoutSessions;
    } else {
      await markEntryCheckoutSessionsRefundChecked(paymentIntentId);
    }
  }

  return { scanned: piIdsToScan.length, updated };
}
