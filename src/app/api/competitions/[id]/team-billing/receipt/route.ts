import { jsonInternalError500 } from "@/lib/apiInternalError";
import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { ReceiptPDF } from "@/components/pdf/ReceiptPDF";
import { generatePdfBuffer } from "@/lib/pdf-helper";
import { fetchStripeReceiptUrlForCheckoutSessionId } from "@/lib/stripeEntryReceiptUrl";
import { buildTeamEntryPaymentOwnerId } from "@/lib/teamEntryPayments";
import { isClubAdminRole } from "@/lib/roleScopes";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import { resolveEntryFeeUnits } from "@/lib/competitionEntryAgeTiered";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function buildTeamReceiptNumber(paymentOrOwnerKey: string, issuedDate: Date) {
  const short = paymentOrOwnerKey.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
  const y = issuedDate.getFullYear();
  const m = String(issuedDate.getMonth() + 1).padStart(2, "0");
  return `TEAM-RCT-${y}${m}-${short}`;
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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { id: competitionId } = await context.params;
    const url = new URL(request.url);
    const clubId = url.searchParams.get("clubId") ?? "";
    const format = url.searchParams.get("format");

    if (!clubId) {
      return NextResponse.json({ error: "clubId が必要です" }, { status: 400 });
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.userId,
        clubId,
        status: "APPROVED",
      },
      select: {
        role: true,
        club: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!membership || !isClubAdminRole(membership.role)) {
      return NextResponse.json({ error: "クラブ管理者権限が必要です" }, { status: 403 });
    }

    const ownerId = buildTeamEntryPaymentOwnerId(competitionId, clubId);

    const [competition, teamCount, payment, latestTeamUpdate] = await Promise.all([
      prisma.competition.findUnique({
        where: { id: competitionId },
        select: {
          id: true,
          name: true,
          startDate: true,
          entryFee: true,
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
      }),
      prisma.teamEntry.count({
        where: { competitionId, clubId },
      }),
      prisma.payment.findUnique({
        where: {
          ownerType_ownerId_type: {
            ownerType: "CLUB",
            ownerId,
            type: "COMPETITION_ENTRY_FEE",
          },
        },
        select: {
          id: true,
          amount: true,
          status: true,
          stripeCheckoutSessionId: true,
          paidAt: true,
          userId: true,
        },
      }),
      prisma.teamEntry.findFirst({
        where: { competitionId, clubId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);

    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    if (teamCount === 0) {
      return NextResponse.json({ error: "チームエントリーがありません" }, { status: 400 });
    }

    const payerUserId = payment?.userId ?? session.userId;
    const payerForAge = await prisma.user.findUnique({
      where: { id: payerUserId },
      select: { dateOfBirth: true },
    });
    const payerAge = payerForAge?.dateOfBirth
      ? getCompetitionEligibilityAgeYears(
          new Date(payerForAge.dateOfBirth),
          new Date(competition.startDate)
        )
      : null;
    const teamUnit = resolveEntryFeeUnits(competition.entryFee, payerAge).teamUnit;
    const totalFeeFromPricing = teamCount * teamUnit;
    const totalFee =
      typeof payment?.amount === "number" && payment.amount >= 0
        ? payment.amount
        : totalFeeFromPricing;

    const isFree = totalFee <= 0;

    const canIssuePdf = isFree || payment?.status === "SUCCEEDED";

    if (!canIssuePdf) {
      return NextResponse.json(
        { error: "決済完了後に領収書を発行できます（無料大会は登録済みのみ）" },
        { status: 400 }
      );
    }
    const payerUser = await prisma.user.findUnique({
      where: { id: payerUserId },
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
    });

    const displayAmount = isFree ? 0 : payment?.amount ?? totalFee;
    const issuedDate = payment?.paidAt ?? latestTeamUpdate?.updatedAt ?? new Date();
    const receiptKey = payment?.id ?? ownerId;
    const receiptNumber = buildTeamReceiptNumber(receiptKey, issuedDate);

    const recipientName = payerUser
      ? `${payerUser.familyName} ${payerUser.givenName}`.trim()
      : "クラブ管理者";
    const recipientLabel = `${membership.club.name}（代表者）`;

    await logAuditAction({
      action: "COMPETITION_TEAM_ENTRY_RECEIPT_VIEW",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      actorUserId: session.userId,
      targetType: "Payment",
      targetId: payment?.id ?? ownerId,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        clubId,
        receiptNumber,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    let stripeHostedUrl: string | null = null;
    if (!isFree && payment?.stripeCheckoutSessionId && payment.amount > 0) {
      try {
        stripeHostedUrl = await fetchStripeReceiptUrlForCheckoutSessionId(
          payment.stripeCheckoutSessionId
        );
      } catch {
        stripeHostedUrl = null;
      }
    }

    if (format === "stripe") {
      if (!stripeHostedUrl) {
        return NextResponse.json(
          {
            error:
              "Stripe の領収書 URL を取得できませんでした（無料・決済不要の場合は PDF をご利用ください）",
          },
          { status: 404 }
        );
      }
      return NextResponse.redirect(stripeHostedUrl, 302);
    }

    if (format === "pdf") {
      const pdfComponent = React.createElement(ReceiptPDF, {
        receiptNumber,
        issuedDate,
        subtitle: `${competition.organization.name} 名義（チームエントリー参加費）`,
        purposeLine: `但、${competition.name} のチーム種目参加申込に係るエントリー費として`,
        referenceLabel: "請求識別子",
        referenceValue: ownerId,
        issuerSectionTitle: "発行元（主催団体）",
        recipientSectionTitle: "お支払い者",
        simplifyTotalsWhenNoTax: true,
        footerText:
          "本書は大会エントリー管理システム（Bluvium）により発行された、主催団体名義の領収書です。\n" +
          "カード決済等をご利用の場合、決済代行会社（Stripe 等）の明細名で請求が表示されることがあります。",
        issuer: {
          name: competition.organization.name,
          email: competition.organization.email ?? "",
          address: formatAddress({
            postalCode: competition.organization.postalCode,
            prefecture: competition.organization.prefecture,
            city: competition.organization.city,
            addressLine1: competition.organization.addressLine1,
            addressLine2: competition.organization.addressLine2,
          }),
        },
        recipient: {
          name: `${recipientLabel} ${recipientName}`,
          email: payerUser?.email ?? "",
          address: formatAddress({
            postalCode: payerUser?.postalCode,
            prefecture: payerUser?.prefecture,
            city: payerUser?.city,
            addressLine1: payerUser?.addressLine1,
            addressLine2: payerUser?.addressLine2,
          }),
        },
        items: [
          {
            description:
              displayAmount > 0
                ? `${competition.name}／チーム種目エントリー（${teamCount}組）`
                : `${competition.name}／チーム種目エントリー（参加費無料・${teamCount}組）`,
            quantity: 1,
            unitPrice: displayAmount,
            amount: displayAmount,
          },
        ],
        subtotal: displayAmount,
        taxAmount: 0,
        totalAmount: displayAmount,
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
      amount: displayAmount,
      competitionId,
      competitionName: competition.name,
      stripeReceiptUrl: stripeHostedUrl,
    });
  } catch (error) {
    return jsonInternalError500("GET api/competitions/[id]/team-billing/receipt/route.ts", error);
  }
}
