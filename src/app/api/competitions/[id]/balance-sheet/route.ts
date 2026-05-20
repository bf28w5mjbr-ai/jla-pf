import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";

async function assertOrgAdminForCompetition(competitionId: string, userId: string) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { organizationId: true },
  });
  if (!competition) {
    return { error: "大会が見つかりません", status: 404 as const };
  }
  try {
    await requireOrgAdmin(competition.organizationId, userId, "operational");
  } catch {
    return { error: "権限がありません", status: 403 as const };
  }
  return { competition };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const gate = await assertOrgAdminForCompetition(competitionId, session.userId);
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const lines = await prisma.competitionBalanceLine.findMany({
      where: { competitionId },
      orderBy: [{ lineDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        lineDate: true,
        accountSubject: true,
        kind: true,
        amount: true,
        notes: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ lines });
  } catch (e) {
    return jsonInternalError500("GET api/competitions/[id]/balance-sheet/route.ts", e);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const gate = await assertOrgAdminForCompetition(competitionId, session.userId);
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = (await request.json()) as {
      lineDate?: string;
      accountSubject?: string;
      kind?: string;
      amount?: number;
      notes?: string | null;
    };

    const lineDateRaw = typeof body.lineDate === "string" ? body.lineDate.trim() : "";
    const accountSubject =
      typeof body.accountSubject === "string" ? body.accountSubject.trim() : "";
    const kind = body.kind === "INCOME" || body.kind === "EXPENSE" ? body.kind : null;
    const amount =
      typeof body.amount === "number" && Number.isFinite(body.amount)
        ? Math.floor(body.amount)
        : NaN;
    const notes =
      typeof body.notes === "string" ? body.notes.trim().slice(0, 5000) : body.notes === null || body.notes === undefined
        ? null
        : "";

    if (!lineDateRaw || !/^\d{4}-\d{2}-\d{2}$/.test(lineDateRaw)) {
      return NextResponse.json({ error: "日付は YYYY-MM-DD で入力してください" }, { status: 400 });
    }
    const lineDate = new Date(`${lineDateRaw}T12:00:00.000Z`);
    if (Number.isNaN(lineDate.getTime())) {
      return NextResponse.json({ error: "日付が不正です" }, { status: 400 });
    }
    if (!accountSubject || accountSubject.length > 200) {
      return NextResponse.json({ error: "科目は1〜200文字で入力してください" }, { status: 400 });
    }
    if (!kind) {
      return NextResponse.json({ error: "収入または支出を選択してください" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount < 1) {
      return NextResponse.json({ error: "金額は1円以上の整数で入力してください" }, { status: 400 });
    }

    const line = await prisma.competitionBalanceLine.create({
      data: {
        competitionId,
        lineDate,
        accountSubject,
        kind,
        amount,
        notes: notes && notes.length > 0 ? notes : null,
        createdById: session.userId,
      },
      select: {
        id: true,
        lineDate: true,
        accountSubject: true,
        kind: true,
        amount: true,
        notes: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ line });
  } catch (e) {
    return jsonInternalError500("POST api/competitions/[id]/balance-sheet/route.ts", e);
  }
}
