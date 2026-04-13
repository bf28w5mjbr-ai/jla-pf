import type Stripe from "stripe";
import { prisma } from "@/server/db";
import { logAuditAction } from "@/lib/auditLog";

function paymentIntentIdFromDispute(
  dispute: Stripe.Dispute
): string | null {
  const ref = dispute.payment_intent;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

export type EntryCheckoutDisputeApplyResult = {
  updatedCheckoutSessions: number;
};

/**
 * charge.dispute.* に応じて EntryCheckoutSession を更新する。
 * stripePaymentIntentId が一致し、かつ該当する遷移のみ更新（冪等）。
 */
export async function applyStripeDisputeToEntryCheckoutSessions(
  dispute: Stripe.Dispute,
  eventType: "charge.dispute.created" | "charge.dispute.closed"
): Promise<EntryCheckoutDisputeApplyResult> {
  const paymentIntentId = paymentIntentIdFromDispute(dispute);
  if (!paymentIntentId) {
    return { updatedCheckoutSessions: 0 };
  }

  if (eventType === "charge.dispute.created") {
    const res = await prisma.entryCheckoutSession.updateMany({
      where: {
        stripePaymentIntentId: paymentIntentId,
        status: "COMPLETED",
      },
      data: {
        status: "DISPUTED",
        stripeDisputeId: dispute.id,
      },
    });
    if (res.count > 0) {
      const targets = await prisma.entryCheckoutSession.findMany({
        where: {
          stripePaymentIntentId: paymentIntentId,
          status: "DISPUTED",
        },
        select: { id: true, competitionId: true, entryId: true },
        take: 20,
      });
      for (const t of targets) {
        void logAuditAction({
          action: "ENTRY_CHECKOUT_DISPUTE_OPENED",
          actorType: "SYSTEM",
          actorKey: "system:stripe_webhook",
          targetType: "EntryCheckoutSession",
          targetId: t.id,
          targetKey: `competition:${t.competitionId}`,
          metadata: {
            stripeDisputeId: dispute.id,
            paymentIntentId,
            entryId: t.entryId,
            reason: dispute.reason ?? null,
          },
          result: "SUCCESS",
        });
      }
    }
    return { updatedCheckoutSessions: res.count };
  }

  // charge.dispute.closed
  if (dispute.status === "won") {
    const res = await prisma.entryCheckoutSession.updateMany({
      where: {
        stripePaymentIntentId: paymentIntentId,
        status: "DISPUTED",
      },
      data: {
        status: "COMPLETED",
        stripeDisputeId: null,
      },
    });
    if (res.count > 0) {
      const targets = await prisma.entryCheckoutSession.findMany({
        where: {
          stripePaymentIntentId: paymentIntentId,
          status: "COMPLETED",
        },
        select: { id: true, competitionId: true, entryId: true },
        take: 20,
      });
      for (const t of targets) {
        void logAuditAction({
          action: "ENTRY_CHECKOUT_DISPUTE_WON",
          actorType: "SYSTEM",
          actorKey: "system:stripe_webhook",
          targetType: "EntryCheckoutSession",
          targetId: t.id,
          targetKey: `competition:${t.competitionId}`,
          metadata: {
            stripeDisputeId: dispute.id,
            paymentIntentId,
            entryId: t.entryId,
          },
          result: "SUCCESS",
        });
      }
    }
    return { updatedCheckoutSessions: res.count };
  }

  if (dispute.status === "lost") {
    const res = await prisma.entryCheckoutSession.updateMany({
      where: {
        stripePaymentIntentId: paymentIntentId,
        status: { in: ["DISPUTED", "COMPLETED"] },
      },
      data: {
        status: "DISPUTE_LOST",
        stripeDisputeId: dispute.id,
      },
    });
    if (res.count > 0) {
      const targets = await prisma.entryCheckoutSession.findMany({
        where: {
          stripePaymentIntentId: paymentIntentId,
          status: "DISPUTE_LOST",
        },
        select: { id: true, competitionId: true, entryId: true },
        take: 20,
      });
      for (const t of targets) {
        void logAuditAction({
          action: "ENTRY_CHECKOUT_DISPUTE_LOST",
          actorType: "SYSTEM",
          actorKey: "system:stripe_webhook",
          targetType: "EntryCheckoutSession",
          targetId: t.id,
          targetKey: `competition:${t.competitionId}`,
          metadata: {
            stripeDisputeId: dispute.id,
            paymentIntentId,
            entryId: t.entryId,
          },
          result: "SUCCESS",
        });
      }
    }
    return { updatedCheckoutSessions: res.count };
  }

  // needs_response / under_review / warning_closed 等: 状態は維持、紛争 ID のみ同期
  const res = await prisma.entryCheckoutSession.updateMany({
    where: {
      stripePaymentIntentId: paymentIntentId,
      status: "DISPUTED",
    },
    data: {
      stripeDisputeId: dispute.id,
    },
  });
  return { updatedCheckoutSessions: res.count };
}
