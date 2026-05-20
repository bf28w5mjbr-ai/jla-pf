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

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { contact: { is: { phoneNumber: { contains: q } } } },
        { profile: { is: { familyName: { contains: q } } } },
        { profile: { is: { givenName: { contains: q } } } },
      ],
    },
    select: {
      id: true,
      email: true,
      profile: { select: { familyName: true, givenName: true, sex: true } },
      contact: { select: { phoneNumber: true } },
    },
    take: 20,
    orderBy: [{ profile: { familyName: "asc" } }, { profile: { givenName: "asc" } }],
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      displayName: `${u.profile?.familyName ?? ""} ${u.profile?.givenName ?? ""}`.trim(),
      email: u.email,
      phoneNumber: u.contact?.phoneNumber ?? "",
      sex: u.profile?.sex ?? "OTHER",
    })),
  });
}
