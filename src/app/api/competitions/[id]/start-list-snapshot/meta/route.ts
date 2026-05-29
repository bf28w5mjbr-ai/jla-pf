import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

type RouteContext = { params: Promise<{ id: string }> };

/** スタートリストスナップショットの記録時刻のみ（一般閲覧の refresh 判定用・軽量） */
export async function GET(_request: Request, context: RouteContext) {
  const { id: competitionId } = await context.params;
  const row = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId },
    select: { capturedAt: true },
  });
  return NextResponse.json({
    capturedAtIso: row?.capturedAt ? row.capturedAt.toISOString() : null,
  });
}
