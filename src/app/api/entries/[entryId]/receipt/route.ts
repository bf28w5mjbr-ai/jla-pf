import type { EntryCheckoutSessionStatus } from "@prisma/client";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { isEntryCheckoutPaidForEligibility } from "@/lib/entryCheckoutSessionPaid";
import { getEntryUserFacingStatus } from "@/lib/entryFinalization";
import { ReceiptPDF } from "@/components/pdf/ReceiptPDF";
import { generatePdfBuffer } from "@/lib/pdf-helper";
import { fetchStripeReceiptUrlForCheckoutSessionId } from "@/lib/stripeEntryReceiptUrl";

type RouteContext = {
  params: Promise<{ entryId: string }>;
};

function buildReceiptNumber(entryId: string, issuedDate: Date) {
  const short = entryId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  const y = issuedDate.getFullYear();
  const m = String(issuedDate.getMonth() + 1).padStart(2, "0");
  return `ENT-RCT-${y}${m}-${short}`;
}

function formatAddress(address: {
  postalCode?: string | null;
  prefecture?: string | null;
  city?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
}) {
  const parts = [
    address.postalCode ? `〒${address.postalCode}` : null,
    address.prefecture,
    address.city,
    address.addressLine1,
    address.addressLine2,
  ].filter(Boolean);
  return parts.join(" ");
}

type CheckoutForReceipt = {
  id: string;
  status: string;
  stripeCheckoutSessionId: string | null;
  stripeReceiptUrl: string | null;
};

/**
 * DB に未保存のときだけ Stripe API で Charge.receipt_url を取りに行き、保存する（過去データのバックフィル）。
 */
async function ensureStripeHostedReceiptUrl(
  checkoutSessions: CheckoutForReceipt[]
): Promise<string | null> {
  const completed = checkoutSessions.filter((s) =>
    isEntryCheckoutPaidForEligibility(s.status as EntryCheckoutSessionStatus)
  );
  const withUrl = completed.find((s) => s.stripeReceiptUrl);
  if (withUrl?.stripeReceiptUrl) return withUrl.stripeReceiptUrl;

  const withStripe = completed.find((s) => s.stripeCheckoutSessionId);
  if (!withStripe?.stripeCheckoutSessionId) return null;

  try {
    const url = await fetchStripeReceiptUrlForCheckoutSessionId(withStripe.stripeCheckoutSessionId);
    if (url) {
      await prisma.entryCheckoutSession.update({
        where: { id: withStripe.id },
        data: { stripeReceiptUrl: url },
      });
      return url;
    }
  } catch {
    // Stripe 未設定・セッション期限など
  }
  return null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { entryId } = await context.params;
    const entry = await prisma.competitionEntry.findFirst({
      where: {
        id: entryId,
        userId: session.userId,
      },
      include: {
        competition: {
          include: {
            organization: {
              select: {
                name: true,
                email: true,
                postalCode: true,
                prefecture: true,
                city: true,
                addressLine1: true,
                addressLine2: true,
              },
            },
          },
        },
        user: {
          select: {
            familyName: true,
            givenName: true,
            email: true,
            postalCode: true,
            prefecture: true,
            city: true,
            addressLine1: true,
            addressLine2: true,
          },
        },
        checkoutSessions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!entry) {
      return NextResponse.json({ error: "エントリーが見つかりません" }, { status: 404 });
    }

    const entryState = getEntryUserFacingStatus({
      status: entry.status,
      totalFee: entry.totalFee,
      checkoutSessions: entry.checkoutSessions.map((item) => ({ status: item.status })),
    });
    if (!entryState.businessEstablished) {
      return NextResponse.json(
        { error: "エントリー成立後に領収書を発行できます" },
        { status: 400 }
      );
    }

    const format = new URL(request.url).searchParams.get("format");

    const latestCompletedCheckout = entry.checkoutSessions.find((item) =>
      isEntryCheckoutPaidForEligibility(item.status)
    );
    const issuedDate =
      latestCompletedCheckout?.completedAt ??
      latestCompletedCheckout?.createdAt ??
      entry.updatedAt;
    const receiptNumber = buildReceiptNumber(entry.id, issuedDate);
    const recipientName = `${entry.user.familyName} ${entry.user.givenName}`.trim();

    await logAuditAction({
      action: "COMPETITION_ENTRY_RECEIPT_VIEW",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      actorUserId: session.userId,
      targetType: "CompetitionEntry",
      targetId: entry.id,
      targetKey: `competition:${entry.competitionId}`,
      metadata: {
        competitionId: entry.competitionId,
        receiptNumber,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    const stripeHostedUrl =
      entry.totalFee > 0
        ? await ensureStripeHostedReceiptUrl(
            entry.checkoutSessions.map((s) => ({
              id: s.id,
              status: s.status,
              stripeCheckoutSessionId: s.stripeCheckoutSessionId,
              stripeReceiptUrl: s.stripeReceiptUrl,
            }))
          )
        : null;

    if (format === "stripe") {
      if (!stripeHostedUrl) {
        return NextResponse.json(
          { error: "Stripe の領収書 URL を取得できませんでした（決済手段や経過時間による場合があります）" },
          { status: 404 }
        );
      }
      return NextResponse.redirect(stripeHostedUrl, 302);
    }

    if (format === "pdf") {
      const pdfComponent = React.createElement(ReceiptPDF, {
        receiptNumber,
        issuedDate,
        subtitle: `${entry.competition.organization.name} 名義（大会エントリー参加費）`,
        purposeLine: `但、${entry.competition.name} の参加申込に係るエントリー費として`,
        referenceLabel: "エントリーID",
        referenceValue: entry.id,
        issuerSectionTitle: "発行元（主催団体）",
        recipientSectionTitle: "お支払い者",
        simplifyTotalsWhenNoTax: true,
        footerText:
          "本書は大会エントリー管理システム（Bluvium）により発行された、主催団体名義の領収書です。\n" +
          "カード決済等をご利用の場合、決済代行会社（Stripe 等）の明細名で請求が表示されることがあります。",
        issuer: {
          name: entry.competition.organization.name,
          email: entry.competition.organization.email ?? "",
          address: formatAddress({
            postalCode: entry.competition.organization.postalCode,
            prefecture: entry.competition.organization.prefecture,
            city: entry.competition.organization.city,
            addressLine1: entry.competition.organization.addressLine1,
            addressLine2: entry.competition.organization.addressLine2,
          }),
        },
        recipient: {
          name: recipientName || "参加者",
          email: entry.user.email,
          address: formatAddress({
            postalCode: entry.user.postalCode,
            prefecture: entry.user.prefecture,
            city: entry.user.city,
            addressLine1: entry.user.addressLine1,
            addressLine2: entry.user.addressLine2,
          }),
        },
        items: [
          {
            description:
              entry.totalFee > 0
                ? `${entry.competition.name}／参加申込手数料（エントリー費）`
                : `${entry.competition.name}／エントリー受付（参加費無料）`,
            quantity: 1,
            unitPrice: entry.totalFee,
            amount: entry.totalFee,
          },
        ],
        subtotal: entry.totalFee,
        taxAmount: 0,
        totalAmount: entry.totalFee,
      });

      const pdfBuffer = await generatePdfBuffer(pdfComponent);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=\"${receiptNumber}.pdf\"`,
        },
      });
    }

    return NextResponse.json({
      receiptNumber,
      issuedDate,
      amount: entry.totalFee,
      competitionId: entry.competitionId,
      competitionName: entry.competition.name,
      stripeReceiptUrl: stripeHostedUrl,
    });
  } catch (error) {
    return jsonInternalError500("GET api/entries/[entryId]/receipt/route.ts", error);
  }
}
