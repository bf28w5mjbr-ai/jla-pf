import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireClubAdmin } from "@/lib/accessControl";
import { logAuditAction, getRequestContext } from "@/lib/auditLog";
import React from "react";
import { ReceiptPDF } from "@/components/pdf/ReceiptPDF";
import { generateAndUploadPdf, generatePdfBuffer } from "@/lib/pdf-helper";

function buildReceiptNumber(duesId: string, paidDate: Date) {
  const short = duesId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  const y = paidDate.getFullYear();
  const m = String(paidDate.getMonth() + 1).padStart(2, "0");
  return `RCT-${y}${m}-${short}`;
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

    if (dues.status !== "PAID" || !dues.paidDate) {
      return NextResponse.json({ error: "未入金のため領収書は発行できません" }, { status: 400 });
    }

    const receiptNumber = buildReceiptNumber(dues.id, dues.paidDate);
    const issuerName = dues.club.mailingName || dues.club.name;
    const recipientName = `${dues.member.user?.familyName ?? ""} ${dues.member.user?.givenName ?? ""}`.trim();

    await logAuditAction({
      action: "CLUB_DUES_RECEIPT_VIEW",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      targetType: "ClubDues",
      targetId: dues.id,
      targetKey: `club:${clubId}`,
      metadata: { clubId, duesId, receiptNumber },
      request: getRequestContext(req),
      result: "SUCCESS",
    });

    const format = new URL(req.url).searchParams.get("format");
    if (format === "pdf") {
      const pdfComponent = React.createElement(ReceiptPDF, {
        receiptNumber,
        issuedDate: dues.paidDate,
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
        invoiceNumber: undefined,
      });

      if (new URL(req.url).searchParams.get("upload") === "true") {
        const { url } = await generateAndUploadPdf({
          component: pdfComponent,
          folder: "receipts",
          basename: receiptNumber,
          metadata: {
            clubId,
            duesId,
            fiscalYear: String(dues.fiscalYear.fiscalYear),
          },
        });

        await prisma.clubDues.update({
          where: { id: dues.id },
          data: {
            receiptNumber,
            receiptUrl: url,
          },
        });

        return NextResponse.json({
          receiptNumber,
          issuedDate: dues.paidDate,
          url,
          format: "pdf",
        });
      }

      const pdfBuffer = await generatePdfBuffer(pdfComponent);

      return new NextResponse(pdfBuffer as any, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=\"${receiptNumber}.pdf\"`,
        },
      });
    }

    return NextResponse.json({
      receiptNumber,
      issuedDate: dues.paidDate,
      club: dues.club,
      member: {
        id: dues.member.id,
        userId: dues.member.userId,
        name: recipientName,
        email: dues.member.user?.email ?? null,
      },
      fiscalYear: dues.fiscalYear.fiscalYear,
      amount: dues.amount,
      paidDate: dues.paidDate,
      receiptUrl: dues.receiptUrl ?? null,
    });
  } catch (error) {
    console.error("GET /api/clubs/[clubId]/dues/[duesId]/receipt error:", error);
    return NextResponse.json({ error: "領収書情報の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function PUT(req: NextRequest) {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function PATCH(req: NextRequest) {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function DELETE(req: NextRequest) {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
