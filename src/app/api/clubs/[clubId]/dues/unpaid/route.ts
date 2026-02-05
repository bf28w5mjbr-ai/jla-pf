import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireClubAdmin } from "@/lib/accessControl";

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

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const fiscalYearRaw = searchParams.get("fiscalYear");
    const includeOverdueOnly = searchParams.get("overdueOnly");

    let fiscalYearFilter: { fiscalYear: number } | undefined;
    if (fiscalYearRaw) {
      const fiscalYear = Number(fiscalYearRaw);
      if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 3000) {
        return NextResponse.json({ error: "fiscalYearが不正です" }, { status: 400 });
      }
      fiscalYearFilter = { fiscalYear };
    }

    const targetStatuses = includeOverdueOnly === "true" ? ["OVERDUE"] : ["UNPAID", "PARTIAL", "OVERDUE"];

    const dues = await prisma.clubDues.findMany({
      where: {
        clubId,
        status: { in: targetStatuses },
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
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ dues });
  } catch (error) {
    console.error("GET /api/clubs/[clubId]/dues/unpaid error:", error);
    return NextResponse.json({ error: "未納会費の取得に失敗しました" }, { status: 500 });
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
