import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  hostOrgAdminGateJsonError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  if (!session?.userId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ error: "検索語は2文字以上で入力してください" }, { status: 400 });
  }

  try {
    await requireHostOrgAdminForCompetition(competitionId, session.userId);
  } catch (e) {
    const gated = hostOrgAdminGateJsonError(e);
    if (gated) {
      return NextResponse.json({ error: gated.error }, { status: gated.status });
    }
    throw e;
  }

  const clubs = await prisma.club.findMany({
    where: {
      status: "APPROVED",
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { nameKana: { contains: q, mode: "insensitive" } },
        { abbreviation: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
    take: 20,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    clubs: clubs.map((c) => ({
      id: c.id,
      name: c.name,
      abbreviation: c.abbreviation,
    })),
  });
}
