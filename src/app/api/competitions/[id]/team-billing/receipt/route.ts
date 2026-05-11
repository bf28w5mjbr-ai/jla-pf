import { jsonInternalError500 } from "@/lib/apiInternalError";
import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { ReceiptPDF } from "@/components/pdf/ReceiptPDF";
import { generatePdfBuffer } from "@/lib/pdf-helper";
import { fetchStripeReceiptUrlForCheckoutSessionId } from "@/lib/stripeEntryReceiptUrl";
import {
  buildClubPrepaidIndividualPaymentOwnerId,
  buildTeamEntryPaymentOwnerId,
} from "@/lib/teamEntryPayments";
import { isClubAdminRole } from "@/lib/roleScopes";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import { resolveEntryFeeUnits } from "@/lib/competitionEntryAgeTiered";
import { partitionUnderBandsForCompetition } from "@/lib/competitionUnderAgeSettings";
import { competitionHostDisplayName } from "@/lib/competitionHostDisplay";
import { coercePdfIssuedDate, nonNegativeYenForPdf } from "@/lib/receiptPdfGuards";

export const runtime = "nodejs";

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

function formatIssuerAddressBlock(org: {
  postalCode?: string | null;
  prefecture?: string | null;
  city?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  phoneNumber?: string | null;
}) {
  const addr = formatAddress(org);
  const tel = org.phoneNumber?.trim();
  if (!addr && !tel) return "";
  if (!tel) return addr;
  if (!addr) return `TEL ${tel}`;
  return `${addr}　TEL ${tel}`;
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
    const billingScope = url.searchParams.get("billingScope") === "prepaid" ? "prepaid" : "team";

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

    const ownerId =
      billingScope === "prepaid"
        ? buildClubPrepaidIndividualPaymentOwnerId(competitionId, clubId)
        : buildTeamEntryPaymentOwnerId(competitionId, clubId);

    const [competition, teamCount, payment, latestTeamUpdate] = await Promise.all([
      prisma.competition.findUnique({
        where: { id: competitionId },
        select: {
          id: true,
          name: true,
          hostOrganizationName: true,
          startDate: true,
          entryFee: true,
          underAgeSystemEnabled: true,
          underAgeUThresholds: true,
          underAgeOpenEnabled: true,
          ageCategories: {
            orderBy: { displayOrder: "asc" },
            select: {
              id: true,
              displayOrder: true,
              eligibleBirthDateFrom: true,
              eligibleBirthDateTo: true,
            },
          },
          organization: {
            select: {
              name: true,
              email: true,
              phoneNumber: true,
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

    if (teamCount === 0 && billingScope === "team") {
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
    const payerDob = payerForAge?.dateOfBirth ? new Date(payerForAge.dateOfBirth) : null;
    const underPartition = partitionUnderBandsForCompetition(competition);
    const teamUnit = resolveEntryFeeUnits(competition.entryFee, payerAge, {
      userDateOfBirth: payerDob,
      competitionAgeCategories: competition.ageCategories,
      underFeePartition: underPartition ?? null,
    }).teamUnit;
    const totalFeeFromPricing =
      billingScope === "prepaid" ? 0 : teamCount * teamUnit;
    const totalFee =
      typeof payment?.amount === "number" && payment.amount >= 0
        ? payment.amount
        : totalFeeFromPricing;

    const isFree = totalFee <= 0;

    const canIssuePdf = isFree || payment?.status === "SUCCEEDED";

    if (!canIssuePdf) {
      return NextResponse.json(
        {
          error:
            billingScope === "prepaid"
              ? "クラブ個人枠の決済完了後に領収書を発行できます"
              : "決済完了後に領収書を発行できます（無料大会は登録済みのみ）",
        },
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

    const totalFeeSanitized = nonNegativeYenForPdf(totalFee, 0);
    const displayAmount = isFree
      ? 0
      : nonNegativeYenForPdf(payment?.amount ?? totalFeeSanitized, totalFeeSanitized);
    const issuedDateRaw = payment?.paidAt ?? latestTeamUpdate?.updatedAt ?? new Date();
    const issuedDate = coercePdfIssuedDate(
      issuedDateRaw,
      latestTeamUpdate?.updatedAt,
      new Date()
    );
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
      const hostIssuerName = competitionHostDisplayName({
        hostOrganizationName: competition.hostOrganizationName,
        organization: { name: competition.organization.name },
      });
      const subtitle =
        billingScope === "prepaid"
          ? `${hostIssuerName} 名義（クラブ個人枠先払い）`
          : `${hostIssuerName} 名義（チームエントリー参加費）`;
      const purposeLine =
        billingScope === "prepaid"
          ? `但、${competition.name} のクラブによる個人エントリー先払い分として`
          : `但、${competition.name} のチーム種目参加申込に係るエントリー費として`;
      const pdfComponent = React.createElement(ReceiptPDF, {
        receiptNumber,
        issuedDate,
        subtitle,
        purposeLine,
        referenceLabel: "請求識別子",
        referenceValue: ownerId,
        issuerSectionTitle: "発行元（主催団体）",
        recipientSectionTitle: "お支払い者",
        simplifyTotalsWhenNoTax: true,
        footerText:
          "本書は大会エントリー管理システム（Bluvium）により発行された、主催団体名義の領収書です。\n" +
          "カード決済等をご利用の場合、決済代行会社（Stripe 等）の明細名で請求が表示されることがあります。",
        issuer: {
          name: hostIssuerName,
          email: competition.organization.email ?? "",
          address: formatIssuerAddressBlock({
            postalCode: competition.organization.postalCode,
            prefecture: competition.organization.prefecture,
            city: competition.organization.city,
            addressLine1: competition.organization.addressLine1,
            addressLine2: competition.organization.addressLine2,
            phoneNumber: competition.organization.phoneNumber,
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
              billingScope === "prepaid"
                ? displayAmount > 0
                  ? `${competition.name}／クラブによる個人エントリー先払い`
                  : `${competition.name}／クラブによる個人エントリー先払い（0円）`
                : displayAmount > 0
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
          "Content-Disposition": `inline; filename="${receiptNumber}.pdf"`,
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
