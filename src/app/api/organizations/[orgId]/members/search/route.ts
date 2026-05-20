import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";

const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 20;

type RouteContext = {
  params: Promise<{ orgId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { orgId: organizationId } = await context.params;

  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "検索権限がありません" }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < MIN_QUERY_LEN) {
      return NextResponse.json({ users: [] as const });
    }

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { profile: { is: { familyName: { contains: q, mode: "insensitive" } } } },
          { profile: { is: { givenName: { contains: q, mode: "insensitive" } } } },
        ],
      },
      select: {
        id: true,
        profile: { select: { familyName: true, givenName: true } },
        email: true,
      },
      orderBy: [{ profile: { familyName: "asc" } }, { profile: { givenName: "asc" } }],
      take: MAX_RESULTS,
    });

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        familyName: u.profile?.familyName ?? "",
        givenName: u.profile?.givenName ?? "",
        email: u.email,
      })),
    });
  } catch (error) {
    return jsonInternalError500("GET api/organizations/[orgId]/members/search/route.ts", error);
  }
}
