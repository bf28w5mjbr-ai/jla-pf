import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  try {
    const { id: competitionId, lineId } = await params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { organizationId: true },
    });
    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    try {
      await requireOrgAdmin(competition.organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const existing = await prisma.competitionBalanceLine.findFirst({
      where: { id: lineId, competitionId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "行が見つかりません" }, { status: 404 });
    }

    await prisma.competitionBalanceLine.delete({ where: { id: lineId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonInternalError500("DELETE api/competitions/[id]/balance-sheet/[lineId]/route.ts", e);
  }
}
