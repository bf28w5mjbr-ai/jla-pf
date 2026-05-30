import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

type RouteContext = { params: Promise<{ id: string }> };

/** スタートリスト refresh 判定用メタ（スナップショット記録時刻・チームメンバー割当の最新更新） */
export async function GET(_request: Request, context: RouteContext) {
  const { id: competitionId } = await context.params;
  const [row, teamMembersAgg] = await Promise.all([
    prisma.competitionStartListSnapshot.findUnique({
      where: { competitionId },
      select: { capturedAt: true },
    }),
    prisma.teamEntryMember.aggregate({
      _max: { updatedAt: true },
      where: { teamEntry: { competitionId } },
    }),
  ]);
  return NextResponse.json({
    capturedAtIso: row?.capturedAt ? row.capturedAt.toISOString() : null,
    teamMembersRevisionIso: teamMembersAgg._max.updatedAt
      ? teamMembersAgg._max.updatedAt.toISOString()
      : null,
  });
}
