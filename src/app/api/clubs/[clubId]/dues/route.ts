import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditAction, getRequestContext } from "@/lib/auditLog";
import { requireClubAdmin } from "@/lib/accessControl";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

const createSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2000).max(3000),
  memberIds: z.array(z.string().min(1)).min(1).optional(),
  amount: z.coerce.number().int().min(0).optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(["UNPAID", "PARTIAL", "PAID", "EXEMPT", "OVERDUE"]).optional(),
});

const statusSchema = z.enum(["UNPAID", "PARTIAL", "PAID", "EXEMPT", "OVERDUE"]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fiscalYearRaw = searchParams.get("fiscalYear");
    const status = searchParams.get("status");
    const memberId = searchParams.get("memberId");

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    }

    let fiscalYearFilter: { fiscalYear: number } | undefined;
    if (fiscalYearRaw) {
      const fiscalYear = Number(fiscalYearRaw);
      if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 3000) {
        return NextResponse.json({ error: "fiscalYearが不正です" }, { status: 400 });
      }
      fiscalYearFilter = { fiscalYear };
    }

    let statusFilter: z.infer<typeof statusSchema> | undefined;
    if (status) {
      const parsedStatus = statusSchema.safeParse(status);
      if (!parsedStatus.success) {
        return NextResponse.json({ error: "statusが不正です" }, { status: 400 });
      }
      statusFilter = parsedStatus.data;
    }

    const dues = await prisma.clubDues.findMany({
      where: {
        clubId,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(memberId ? { memberId } : {}),
        ...(fiscalYearFilter ? { fiscalYear: fiscalYearFilter } : {}),
      },
      include: {
        fiscalYear: true,
        member: {
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return NextResponse.json({ dues });
  } catch (error) {
    return jsonInternalError500("GET api/clubs/[clubId]/dues/route.ts", error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
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
    const data = createSchema.parse(body);

    const fiscalYear = await prisma.clubFiscalYear.findUnique({
      where: {
        clubId_fiscalYear: { clubId, fiscalYear: data.fiscalYear },
      },
    });
    if (!fiscalYear) {
      return NextResponse.json({ error: "会費設定が見つかりません" }, { status: 404 });
    }

    if (data.dueDate && (data.dueDate < fiscalYear.startDate || data.dueDate > fiscalYear.endDate)) {
      return NextResponse.json({ error: "dueDateが年度範囲外です" }, { status: 400 });
    }

    if (fiscalYear.membershipFeeAppliesTo === "SELECTED" && !data.memberIds?.length) {
      return NextResponse.json({ error: "対象メンバーが必要です" }, { status: 400 });
    }

    const targetMemberships = data.memberIds?.length
      ? await prisma.membership.findMany({
          where: { clubId, id: { in: data.memberIds }, status: "APPROVED" },
          select: { id: true },
        })
      : await prisma.membership.findMany({
          where: { clubId, status: "APPROVED" },
          select: { id: true },
        });

    if (targetMemberships.length === 0) {
      return NextResponse.json({ error: "対象メンバーが見つかりません" }, { status: 400 });
    }

    const amount = data.amount ?? fiscalYear.membershipFee;
    const duesData = targetMemberships.map((m) => ({
      clubId,
      fiscalYearId: fiscalYear.id,
      memberId: m.id,
      amount,
      status: data.status ?? "UNPAID",
      dueDate: data.dueDate,
      notes: data.notes ?? undefined,
    }));

    const result = await prisma.clubDues.createMany({
      data: duesData,
      skipDuplicates: true,
    });

    await logAuditAction({
      action: "CLUB_DUES_CREATE",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      targetType: "ClubDues",
      targetKey: `club:${clubId}`,
      metadata: {
        clubId,
        fiscalYear: data.fiscalYear,
        createdCount: result.count,
        requestedCount: duesData.length,
      },
      request: getRequestContext(req),
      result: "SUCCESS",
    });

    return NextResponse.json({
      createdCount: result.count,
      requestedCount: duesData.length,
      skippedCount: duesData.length - result.count,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error, "validation_error"), { status: 400 });
    }
    return jsonInternalError500("POST api/clubs/[clubId]/dues/route.ts", error);
  }
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
