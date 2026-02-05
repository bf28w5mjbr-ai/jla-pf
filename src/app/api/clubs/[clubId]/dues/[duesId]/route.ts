import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireClubAdmin } from "@/lib/accessControl";
import { logAuditAction, getRequestContext } from "@/lib/auditLog";

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
    console.error("GET /api/clubs/[clubId]/dues/[duesId] error:", error);
    return NextResponse.json({ error: "会費の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function PUT(req: NextRequest) {
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
      return NextResponse.json({ error: "validation_error", details: error.errors }, { status: 400 });
    }
    console.error("PATCH /api/clubs/[clubId]/dues/[duesId] error:", error);
    return NextResponse.json({ error: "会費の更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
