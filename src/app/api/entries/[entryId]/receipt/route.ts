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
import { competitionHostDisplayName } from "@/lib/competitionHostDisplay";
import { pickLatestPaidCheckoutForReceipt } from "@/lib/entryReceiptCheckoutPick";

export const runtime = "nodejs";

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

function snapshotRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

function collectIndividualEventNames(
  items: { event: { name: string; type: string } | null }[],
  snapshotData: unknown,
  eventNameById: Map<string, string>,
  eventTypeById: Map<string, string>
): string[] {
  const fromRows = items
    .filter((row) => row.event?.type !== "TEAM")
    .map((row) => row.event?.name?.trim())
    .filter((n): n is string => Boolean(n));
  if (fromRows.length > 0) return fromRows;

  const snap = snapshotRecord(snapshotData);
  const snapItems = snap && Array.isArray(snap.items) ? snap.items : [];
  const names: string[] = [];
  for (const row of snapItems) {
    if (!row || typeof row !== "object") continue;
    const eid = (row as Record<string, unknown>).eventId;
    if (typeof eid !== "string" || !eid) continue;
    if (eventTypeById.get(eid) === "TEAM") continue;
    const nm = eventNameById.get(eid)?.trim();
    if (nm) names.push(nm);
  }
  return names;
}

function buildIndividualEntryPdfItemDescription(opts: {
  competitionName: string;
  totalFee: number;
  snapshotData: unknown;
  items: { event: { name: string; type: string } | null }[];
  eventNameById: Map<string, string>;
  eventTypeById: Map<string, string>;
  clubName: string | null;
}): string {
  const base =
    opts.totalFee > 0
      ? `${opts.competitionName}／参加申込手数料（エントリー費）`
      : `${opts.competitionName}／エントリー受付（参加費無料）`;
  const bits: string[] = [];

  const indiv = collectIndividualEventNames(
    opts.items,
    opts.snapshotData,
    opts.eventNameById,
    opts.eventTypeById
  );
  if (indiv.length > 0) bits.push(`個人種目: ${indiv.join("、")}`);

  const snap = snapshotRecord(opts.snapshotData);
  const teamRaw = snap && Array.isArray(snap.teamEntries) ? snap.teamEntries : [];
  const teamBits: string[] = [];
  for (const row of teamRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const eid = typeof r.eventId === "string" ? r.eventId : "";
    const teamName = typeof r.teamName === "string" ? r.teamName.trim() : "";
    const en = (eid && opts.eventNameById.get(eid)?.trim()) || "";
    if (en && teamName) teamBits.push(`${en}（${teamName}）`);
    else if (en) teamBits.push(en);
  }
  if (teamBits.length > 0) bits.push(`チーム種目: ${teamBits.join("、")}`);

  const club = opts.clubName?.trim();
  if (club) bits.push(`所属クラブ: ${club}`);

  if (bits.length === 0) return base;
  return `${base}（${bits.join("　")}）`;
}

type CheckoutForReceipt = {
  id: string;
  status: string;
  stripeCheckoutSessionId: string | null;
  stripeReceiptUrl: string | null;
  completedAt: Date | null;
  createdAt: Date;
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
  const ordered = [...completed].sort((a, b) => {
    const ta = (a.completedAt ?? a.createdAt).getTime();
    const tb = (b.completedAt ?? b.createdAt).getTime();
    return tb - ta;
  });
  const withUrl = ordered.find((s) => s.stripeReceiptUrl);
  if (withUrl?.stripeReceiptUrl) return withUrl.stripeReceiptUrl;

  const withStripe = ordered.find((s) => s.stripeCheckoutSessionId);
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
          select: {
            id: true,
            name: true,
            hostOrganizationName: true,
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
            events: {
              select: { id: true, name: true, type: true },
            },
          },
        },
        club: { select: { name: true } },
        items: {
          orderBy: { id: "asc" },
          include: { event: { select: { name: true, type: true } } },
        },
        snapshot: { select: { data: true } },
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
      clubIndividualFeePaidAt: entry.clubIndividualFeePaidAt,
    });
    if (!entryState.businessEstablished) {
      return NextResponse.json(
        { error: "エントリー成立後に領収書を発行できます" },
        { status: 400 }
      );
    }

    const format = new URL(request.url).searchParams.get("format");

    const latestCompletedCheckout = pickLatestPaidCheckoutForReceipt(entry.checkoutSessions);
    const chargedYen =
      latestCompletedCheckout && typeof latestCompletedCheckout.amount === "number"
        ? latestCompletedCheckout.amount
        : entry.totalFee;
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
              completedAt: s.completedAt,
              createdAt: s.createdAt,
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
      const hostIssuerName = competitionHostDisplayName({
        hostOrganizationName: entry.competition.hostOrganizationName,
        organization: { name: entry.competition.organization.name },
      });
      const eventNameById = new Map(entry.competition.events.map((e) => [e.id, e.name]));
      const eventTypeById = new Map(
        entry.competition.events.map((e) => [e.id, e.type as string])
      );
      const itemDescription = buildIndividualEntryPdfItemDescription({
        competitionName: entry.competition.name,
        totalFee: entry.totalFee,
        snapshotData: entry.snapshot?.data,
        items: entry.items,
        eventNameById,
        eventTypeById,
        clubName: entry.club?.name ?? null,
      });

      const processingYen =
        entry.totalFee > 0 && chargedYen > entry.totalFee ? chargedYen - entry.totalFee : 0;
      const receiptItems =
        entry.totalFee > 0 && processingYen > 0
          ? [
              {
                description: `${itemDescription}（参加費）`,
                quantity: 1,
                unitPrice: entry.totalFee,
                amount: entry.totalFee,
              },
              {
                description: "決済手数料（カード決済等・お支払い者負担）",
                quantity: 1,
                unitPrice: processingYen,
                amount: processingYen,
              },
            ]
          : [
              {
                description: itemDescription,
                quantity: 1,
                unitPrice: entry.totalFee,
                amount: entry.totalFee,
              },
            ];
      const pdfTotalAmount = entry.totalFee > 0 ? chargedYen : 0;

      const pdfComponent = React.createElement(ReceiptPDF, {
        receiptNumber,
        issuedDate,
        subtitle: `${hostIssuerName} 名義（大会エントリー参加費）`,
        purposeLine: `但、${entry.competition.name} の参加申込に係るエントリー費として`,
        referenceLabel: "エントリーID",
        referenceValue: entry.id,
        issuerSectionTitle: "発行元（主催団体）",
        recipientSectionTitle: "お支払い者",
        simplifyTotalsWhenNoTax: true,
        footerText:
          "本書は大会エントリー管理システム（Bluvium）により発行された、主催団体名義の領収書です。\n" +
          "カード決済等をご利用の場合、決済代行会社（Stripe 等）の明細名で請求が表示されることがあります。\n" +
          (processingYen > 0
            ? "「決済手数料」はカード決済に伴う費用の目安としてお支払いいただいた金額です。"
            : ""),
        issuer: {
          name: hostIssuerName,
          email: entry.competition.organization.email ?? "",
          address: formatIssuerAddressBlock({
            postalCode: entry.competition.organization.postalCode,
            prefecture: entry.competition.organization.prefecture,
            city: entry.competition.organization.city,
            addressLine1: entry.competition.organization.addressLine1,
            addressLine2: entry.competition.organization.addressLine2,
            phoneNumber: entry.competition.organization.phoneNumber,
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
        items: receiptItems,
        subtotal: pdfTotalAmount,
        taxAmount: 0,
        totalAmount: pdfTotalAmount,
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
      amount: chargedYen,
      entryFeeYen: entry.totalFee,
      competitionId: entry.competitionId,
      competitionName: entry.competition.name,
      stripeReceiptUrl: stripeHostedUrl,
    });
  } catch (error) {
    return jsonInternalError500("GET api/entries/[entryId]/receipt/route.ts", error);
  }
}
