import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireClubAdmin } from "@/lib/accessControl";
import { logAuditAction, getRequestContext } from "@/lib/auditLog";
import React from "react";
import { InvoicePDF } from "@/components/pdf/InvoicePDF";
import { generateAndUploadPdf, generatePdfBuffer } from "@/lib/pdf-helper";

function buildInvoiceNumber(duesId: string, fiscalYear: number) {
  const short = duesId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `INV-${fiscalYear}-${short}`;
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string; duesId: string }> }
) {
  try {
    const { clubId, duesId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    }

    const dues = await prisma.clubDues.findUnique({
      where: { id: duesId },
      include: {
        fiscalYear: true,
        club: {
          select: {
            id: true,
            name: true,
            officePostalCode: true,
            officePrefecture: true,
            officeCity: true,
            officeAddressLine1: true,
            officeAddressLine2: true,
            mailingName: true,
          },
        },
        member: {
          select: {
            id: true,
            userId: true,
            status: true,
            user: {
              select: {
                id: true,
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
          },
        },
      },
    });

    if (!dues || dues.clubId !== clubId) {
      return NextResponse.json({ error: "会費が見つかりません" }, { status: 404 });
    }

    const invoiceNumber = buildInvoiceNumber(dues.id, dues.fiscalYear.fiscalYear);
    const issueDate = new Date();

    const issuerName = dues.club.mailingName || dues.club.name;
    const recipientName = `${dues.member.user?.familyName ?? ""} ${dues.member.user?.givenName ?? ""}`.trim();

    await logAuditAction({
      action: "CLUB_DUES_INVOICE_VIEW",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      targetType: "ClubDues",
      targetId: dues.id,
      targetKey: `club:${clubId}`,
      metadata: { clubId, duesId, invoiceNumber },
      request: getRequestContext(req),
      result: "SUCCESS",
    });

    const format = new URL(req.url).searchParams.get("format");
    if (format === "pdf") {
      const pdfComponent = React.createElement(InvoicePDF, {
        invoiceNumber,
        issuedDate: issueDate,
        dueDate: dues.dueDate ?? dues.fiscalYear.endDate,
        issuer: {
          name: issuerName,
          email: "",
          address: formatAddress({
            postalCode: dues.club.officePostalCode,
            prefecture: dues.club.officePrefecture,
            city: dues.club.officeCity,
            addressLine1: dues.club.officeAddressLine1,
            addressLine2: dues.club.officeAddressLine2,
          }),
        },
        recipient: {
          name: recipientName || "会員",
          email: dues.member.user?.email ?? "",
          address: formatAddress({
            postalCode: dues.member.user?.postalCode,
            prefecture: dues.member.user?.prefecture,
            city: dues.member.user?.city,
            addressLine1: dues.member.user?.addressLine1,
            addressLine2: dues.member.user?.addressLine2,
          }),
        },
        items: [
          {
            description: `クラブ会費（${dues.fiscalYear.fiscalYear}年度）`,
            quantity: 1,
            unitPrice: dues.amount,
            amount: dues.amount,
          },
        ],
        subtotal: dues.amount,
        taxAmount: 0,
        totalAmount: dues.amount,
        notes: dues.notes ?? dues.fiscalYear.description ?? undefined,
      });

      if (new URL(req.url).searchParams.get("upload") === "true") {
        const { url } = await generateAndUploadPdf({
          component: pdfComponent,
          folder: "invoices",
          basename: invoiceNumber,
          metadata: {
            clubId,
            duesId,
            fiscalYear: String(dues.fiscalYear.fiscalYear),
          },
        });

        await prisma.clubDues.update({
          where: { id: dues.id },
          data: {
            invoiceNumber,
            invoiceIssuedAt: issueDate,
            invoiceUrl: url,
          },
        });

        return NextResponse.json({
          invoiceNumber,
          issuedDate: issueDate,
          url,
          format: "pdf",
        });
      }

      const pdfBuffer = await generatePdfBuffer(pdfComponent);

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=\"${invoiceNumber}.pdf\"`,
        },
      });
    }

    return NextResponse.json({
      invoiceNumber,
      issueDate,
      club: dues.club,
      member: {
        id: dues.member.id,
        userId: dues.member.userId,
        name: recipientName,
        email: dues.member.user?.email ?? null,
      },
      fiscalYear: dues.fiscalYear.fiscalYear,
      dueDate: dues.dueDate,
      amount: dues.amount,
      status: dues.status,
      invoiceUrl: dues.invoiceUrl ?? null,
      invoiceIssuedAt: dues.invoiceIssuedAt ?? null,
    });
  } catch (error) {
    return jsonInternalError500("GET api/clubs/[clubId]/dues/[duesId]/invoice/route.ts", error);
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
