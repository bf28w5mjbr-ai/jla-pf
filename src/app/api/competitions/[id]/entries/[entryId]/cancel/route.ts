export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isOrgAdminRole } from "@/lib/roleScopes";
import { stripe } from "@/lib/stripe";

type RouteContext = {
  params: Promise<{ id: string; entryId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId, entryId } = await context.params;

  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const entry = await prisma.competitionEntry.findFirst({
      where: {
        id: entryId,
        competitionId,
      },
      include: {
        competition: {
          include: {
            organization: {
              include: {
                admins: {
                  where: { userId: session.userId },
                },
              },
            },
          },
        },
        checkoutSessions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ message: "エントリーが見つかりません" }, { status: 404 });
    }

    const isAdmin = entry.competition.organization.admins.some((admin) =>
      isOrgAdminRole(admin.role)
    );
    if (!isAdmin) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    if (entry.status === "CANCELLED") {
      return NextResponse.json({ message: "すでに取消済みです" }, { status: 400 });
    }

    const latestCompletedSession = entry.checkoutSessions.find(
      (record) => record.status === "COMPLETED" && Boolean(record.stripeCheckoutSessionId)
    );

    let refundId: string | null = null;
    if (latestCompletedSession?.stripeCheckoutSessionId && entry.totalFee > 0) {
      const checkoutSession = await stripe.checkout.sessions.retrieve(
        latestCompletedSession.stripeCheckoutSessionId,
        {
          expand: ["payment_intent"],
        }
      );

      const paymentIntent =
        typeof checkoutSession.payment_intent === "string"
          ? checkoutSession.payment_intent
          : checkoutSession.payment_intent?.id;

      if (!paymentIntent) {
        return NextResponse.json(
          { message: "返金対象の決済情報を取得できませんでした" },
          { status: 400 }
        );
      }

      const refund = await stripe.refunds.create({
        payment_intent: paymentIntent,
      });
      refundId = refund.id;
    }

    await prisma.$transaction(async (tx) => {
      await tx.competitionEntry.update({
        where: { id: entry.id },
        data: {
          status: "CANCELLED",
        },
      });

      await tx.entryCheckoutSession.updateMany({
        where: {
          entryId: entry.id,
          status: "PENDING",
        },
        data: {
          status: "EXPIRED",
          expiredAt: new Date(),
        },
      });

      if (latestCompletedSession) {
        const currentPayload =
          latestCompletedSession.payload && typeof latestCompletedSession.payload === "object"
            ? (latestCompletedSession.payload as Record<string, unknown>)
            : {};

        await tx.entryCheckoutSession.update({
          where: { id: latestCompletedSession.id },
          data: {
            payload: {
              ...currentPayload,
              refundId,
              refundedAt: refundId ? new Date().toISOString() : null,
              cancelledAt: new Date().toISOString(),
              cancelledByUserId: session.userId,
            },
          },
        });
      }

      await tx.teamEntryMember.deleteMany({
        where: {
          userId: entry.userId,
          role: "ATHLETE",
          teamEntry: {
            competitionId,
          },
        },
      });
    });

    return NextResponse.json({
      message: refundId ? "エントリーを取消し、返金を実行しました" : "エントリーを取消しました",
      refunded: Boolean(refundId),
      refundId,
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/entries/[entryId]/cancel/route.ts", error);
  }
}
