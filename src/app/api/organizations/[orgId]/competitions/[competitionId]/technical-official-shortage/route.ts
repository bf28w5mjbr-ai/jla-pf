export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { listTechnicalOfficialShortagesForCompetition } from "@/lib/technicalOfficialQueries";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgId: string; competitionId: string }> }
) {
  try {
    const { orgId: organizationId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const competition = await prisma.competition.findFirst({
      where: { id: competitionId, organizationId },
      select: { id: true },
    });
    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    const rows = await listTechnicalOfficialShortagesForCompetition(prisma, competitionId);
    return NextResponse.json({ shortage: rows });
  } catch (error) {
    return jsonInternalError500(
      "GET api/organizations/.../technical-official-shortage",
      error
    );
  }
}
