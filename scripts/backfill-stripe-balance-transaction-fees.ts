/**
 * 既存決済の Stripe balance_transaction.fee を DB に保存する。
 *
 *   pnpm exec tsx --env-file=.env scripts/backfill-stripe-balance-transaction-fees.ts <competitionId>
 *   pnpm exec tsx --env-file=.env scripts/backfill-stripe-balance-transaction-fees.ts --all
 */
import { prisma } from "../src/server/db";
import {
  fetchStripeBalanceTransactionFeeYen,
  parseStripeBalanceTransactionFeeYen,
  STRIPE_BALANCE_TRANSACTION_FEE_PAYLOAD_KEY,
  STRIPE_BALANCE_TRANSACTION_FEE_SYNCED_AT_KEY,
} from "../src/lib/stripeBalanceTransactionFee";

function parsePayloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

async function backfillEntryCheckoutSessions(competitionId?: string) {
  const sessions = await prisma.entryCheckoutSession.findMany({
    where: {
      ...(competitionId ? { competitionId } : {}),
      status: { in: ["COMPLETED", "DISPUTED", "DISPUTE_LOST"] },
      stripePaymentIntentId: { not: null },
    },
    select: { id: true, payload: true, stripePaymentIntentId: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const session of sessions) {
    if (parseStripeBalanceTransactionFeeYen(session.payload) != null) {
      skipped += 1;
      continue;
    }
    const piId = session.stripePaymentIntentId;
    if (!piId) continue;

    const fee = await fetchStripeBalanceTransactionFeeYen(piId);
    if (fee == null) continue;

    const current = parsePayloadRecord(session.payload);
    await prisma.entryCheckoutSession.update({
      where: { id: session.id },
      data: {
        payload: {
          ...current,
          [STRIPE_BALANCE_TRANSACTION_FEE_PAYLOAD_KEY]: fee,
          [STRIPE_BALANCE_TRANSACTION_FEE_SYNCED_AT_KEY]: new Date().toISOString(),
        },
      },
    });
    updated += 1;
  }

  return { scanned: sessions.length, updated, skipped };
}

async function backfillPayments(competitionId?: string) {
  const payments = await prisma.payment.findMany({
    where: {
      type: "COMPETITION_ENTRY_FEE",
      status: { in: ["SUCCEEDED", "DISPUTED", "REFUNDED"] },
      stripePaymentIntentId: { not: null },
      ...(competitionId
        ? { metadata: { path: ["competitionId"], equals: competitionId } }
        : {}),
    },
    select: { id: true, metadata: true, stripePaymentIntentId: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const payment of payments) {
    if (parseStripeBalanceTransactionFeeYen(payment.metadata) != null) {
      skipped += 1;
      continue;
    }
    const piId = payment.stripePaymentIntentId;
    if (!piId) continue;

    const fee = await fetchStripeBalanceTransactionFeeYen(piId);
    if (fee == null) continue;

    const current = parsePayloadRecord(payment.metadata);
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        metadata: {
          ...current,
          [STRIPE_BALANCE_TRANSACTION_FEE_PAYLOAD_KEY]: fee,
          [STRIPE_BALANCE_TRANSACTION_FEE_SYNCED_AT_KEY]: new Date().toISOString(),
        },
      },
    });
    updated += 1;
  }

  return { scanned: payments.length, updated, skipped };
}

async function backfillRefundedCheckoutsOnPayments(competitionId?: string) {
  const payments = await prisma.payment.findMany({
    where: {
      type: "COMPETITION_ENTRY_FEE",
      ...(competitionId
        ? { metadata: { path: ["competitionId"], equals: competitionId } }
        : {}),
    },
    select: { id: true, metadata: true },
  });

  let updated = 0;

  for (const payment of payments) {
    const meta = parsePayloadRecord(payment.metadata);
    if (!Array.isArray(meta.stripeRefundedCheckouts)) continue;

    let changed = false;
    const nextCheckouts = [];
    for (const row of meta.stripeRefundedCheckouts) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const record = row as Record<string, unknown>;
      const piId = typeof record.paymentIntentId === "string" ? record.paymentIntentId : null;
      if (
        piId &&
        (typeof record.stripeBalanceTransactionFeeYen !== "number" ||
          !Number.isFinite(record.stripeBalanceTransactionFeeYen))
      ) {
        const fee = await fetchStripeBalanceTransactionFeeYen(piId);
        if (fee != null) {
          nextCheckouts.push({ ...record, stripeBalanceTransactionFeeYen: fee });
          changed = true;
          continue;
        }
      }
      nextCheckouts.push(record);
    }

    if (changed) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          metadata: {
            ...meta,
            stripeRefundedCheckouts: nextCheckouts,
          },
        },
      });
      updated += 1;
    }
  }

  return { updated };
}

async function main() {
  const arg = process.argv[2];
  const competitionId = arg === "--all" ? undefined : arg;

  if (!arg) {
    console.error(
      "Usage: tsx scripts/backfill-stripe-balance-transaction-fees.ts <competitionId> | --all"
    );
    process.exit(1);
  }

  if (competitionId) {
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { id: true, name: true },
    });
    if (!competition) {
      console.error("Competition not found:", competitionId);
      process.exit(1);
    }
    console.log(`Competition: ${competition.name} (${competition.id})`);
  } else {
    console.log("Backfilling all competitions...");
  }

  const entryResult = await backfillEntryCheckoutSessions(competitionId);
  console.log("EntryCheckoutSession:", entryResult);

  const paymentResult = await backfillPayments(competitionId);
  console.log("Payment:", paymentResult);

  const refundedResult = await backfillRefundedCheckoutsOnPayments(competitionId);
  console.log("Refunded checkouts on Payment:", refundedResult);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
