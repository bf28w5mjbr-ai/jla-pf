import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireClubAdmin } from "@/lib/accessControl";
import { logAuditAction, getRequestContext } from "@/lib/auditLog";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

const statusSchema = z.enum(["UNPAID", "PARTIAL", "PAID", "EXEMPT", "OVERDUE"]);
const updateSchema = z.object({
  amount: z.coerce.number().int().min(0).optional(),
  status: statusSchema.optional(),
  dueDate: z.coerce.date().optional().nullable(),
  paidDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

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
        member: {
          select: { id: true, userId: true, role: true, status: true },
        },
      },
    });

    if (!dues || dues.clubId !== clubId) {
      return NextResponse.json({ error: "会費が見つかりません" }, { status: 404 });
    }

    return NextResponse.json(dues);
  } catch (error) {
    return jsonInternalError500("GET api/clubs/[clubId]/dues/[duesId]/route.ts", error);
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function PATCH(
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

    const body = await req.json();
    const data = updateSchema.parse(body);

    const existing = await prisma.clubDues.findUnique({
      where: { id: duesId },
      include: { fiscalYear: true },
    });

    if (!existing || existing.clubId !== clubId) {
      return NextResponse.json({ error: "会費が見つかりません" }, { status: 404 });
    }

    if (data.dueDate && (data.dueDate < existing.fiscalYear.startDate || data.dueDate > existing.fiscalYear.endDate)) {
      return NextResponse.json({ error: "dueDateが年度範囲外です" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      amount: data.amount,
      status: data.status,
      dueDate: data.dueDate === null ? null : data.dueDate,
      paidDate: data.paidDate === null ? null : data.paidDate,
      notes: data.notes === null ? null : data.notes,
    };

    if (data.status === "PAID" && data.paidDate === undefined) {
      updateData.paidDate = new Date();
    }

    const updated = await prisma.clubDues.update({
      where: { id: duesId },
      data: updateData,
    });

    await logAuditAction({
      action: "CLUB_DUES_UPDATE",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      targetType: "ClubDues",
      targetId: updated.id,
      targetKey: `club:${clubId}`,
      metadata: { clubId, duesId },
      request: getRequestContext(req),
      result: "SUCCESS",
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error, "validation_error"), { status: 400 });
    }
    return jsonInternalError500(
      "PATCH api/clubs/[clubId]/dues/[duesId]/route.ts",
      error
    );
  }
}

export async function DELETE() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
