import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  fetchStripeBalanceTransactionFeeYen,
  STRIPE_BALANCE_TRANSACTION_FEE_PAYLOAD_KEY,
  STRIPE_BALANCE_TRANSACTION_FEE_SYNCED_AT_KEY,
} from "@/lib/stripeBalanceTransactionFee";
import { fetchStripeReceiptUrlForCheckoutSessionId } from "@/lib/stripeEntryReceiptUrl";
import { safeServerErrorLog } from "@/lib/safeServerLog";
import {
  loadCandidateEventIdsForCompetitionEntry,
  syncStartListSnapshotBeforeMarshal,
} from "@/lib/startListSnapshotOnEntryIncrease";

/**
 * Stripe 推奨: checkout.session.completed だけでは支払済みと限らない（遅延通知の決済手段などで unpaid のことがある）。
 * エントリー成立に使うのは実際に支払いが成立したセッションのみ。
 */
export function isCheckoutSessionPaymentCaptured(
  session: Stripe.Checkout.Session
): boolean {
  const ps = session.payment_status;
  return ps === "paid" || ps === "no_payment_required";
}

/** Webhook の JSON に payment_status が欠けるケースに備え、API で最新の Session を取得する */
export async function resolveCheckoutSessionForEntryUpdate(
  session: Stripe.Checkout.Session
): Promise<Stripe.Checkout.Session> {
  if (!session.id) return session;
  const ps = session.payment_status;
  if (ps != null) return session;
  try {
    return await stripe.checkout.sessions.retrieve(session.id);
  } catch (error) {
    safeServerErrorLog("resolveCheckoutSessionForEntryUpdate", error);
    return session;
  }
}

export type FinalizedEntryCheckoutTarget = {
  id: string;
  entryId: string | null;
  competitionId: string;
};

function extractPaymentIntentId(
  ref: string | Stripe.PaymentIntent | null | undefined
): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/**
 * Stripe 上で入金確定している Checkout Session に紐づく EntryCheckoutSession を COMPLETED にする。
 * Webhook とエントリーページの自己修復の双方から呼ぶ（冪等）。
 */
export async function finalizeEntryCheckoutSessionsFromStripeSession(
  session: Stripe.Checkout.Session
): Promise<FinalizedEntryCheckoutTarget[]> {
  const resolved = await resolveCheckoutSessionForEntryUpdate(session);
  if (!isCheckoutSessionPaymentCaptured(resolved)) {
    return [];
  }

  const conditions: Prisma.EntryCheckoutSessionWhereInput[] = [];
  if (resolved.id) {
    conditions.push({ stripeCheckoutSessionId: resolved.id });
  }
  if (resolved.metadata?.entryCheckoutSessionId) {
    conditions.push({ id: resolved.metadata.entryCheckoutSessionId });
  }
  if (conditions.length === 0) return [];

  const targets = await prisma.entryCheckoutSession.findMany({
    where: { OR: conditions },
    select: {
      id: true,
      entryId: true,
      competitionId: true,
      payload: true,
    },
  });

  let stripeReceiptUrl: string | null = null;
  if (resolved.id) {
    try {
      stripeReceiptUrl = await fetchStripeReceiptUrlForCheckoutSessionId(resolved.id);
    } catch (error) {
      safeServerErrorLog("fetchStripeReceiptUrlForCheckoutSessionId", error);
      stripeReceiptUrl = null;
    }
  }

  const paymentIntentId = extractPaymentIntentId(resolved.payment_intent);

  await prisma.entryCheckoutSession.updateMany({
    where: { OR: conditions },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      ...(stripeReceiptUrl ? { stripeReceiptUrl } : {}),
      ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
    },
  });

  if (paymentIntentId) {
    const stripeBalanceTransactionFeeYen =
      await fetchStripeBalanceTransactionFeeYen(paymentIntentId);
    if (stripeBalanceTransactionFeeYen != null) {
      const syncedAt = new Date().toISOString();
      for (const target of targets) {
        const currentPayload =
          target.payload && typeof target.payload === "object" && !Array.isArray(target.payload)
            ? (target.payload as Record<string, unknown>)
            : {};
        await prisma.entryCheckoutSession.update({
          where: { id: target.id },
          data: {
            payload: {
              ...currentPayload,
              [STRIPE_BALANCE_TRANSACTION_FEE_PAYLOAD_KEY]: stripeBalanceTransactionFeeYen,
              [STRIPE_BALANCE_TRANSACTION_FEE_SYNCED_AT_KEY]: syncedAt,
            },
          },
        });
      }
    }
  }

  const eventIdsByCompetition = new Map<string, Set<string>>();
  for (const target of targets) {
    if (!target.entryId || !target.competitionId) continue;
    const loaded = await loadCandidateEventIdsForCompetitionEntry(target.entryId);
    if (!loaded || loaded.eventIds.length === 0) continue;
    const set = eventIdsByCompetition.get(loaded.competitionId) ?? new Set<string>();
    for (const eventId of loaded.eventIds) {
      set.add(eventId);
    }
    eventIdsByCompetition.set(loaded.competitionId, set);
  }
  for (const [competitionId, eventIdSet] of eventIdsByCompetition) {
    await syncStartListSnapshotBeforeMarshal({
      competitionId,
      candidateEventIds: [...eventIdSet],
      trigger: "STRIPE_CHECKOUT",
    });
  }

  return targets;
}
