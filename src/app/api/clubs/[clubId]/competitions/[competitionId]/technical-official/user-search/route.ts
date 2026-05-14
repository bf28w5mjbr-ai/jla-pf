export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireClubAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";

const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 20;

type RouteContext = { params: Promise<{ clubId: string; competitionId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { clubId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < MIN_QUERY_LEN) {
      return NextResponse.json(
        { error: `検索語は${MIN_QUERY_LEN}文字以上で入力してください` },
        { status: 400 }
      );
    }

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { phoneNumber: { contains: q } },
          { familyName: { contains: q, mode: "insensitive" } },
          { givenName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        familyName: true,
        givenName: true,
        email: true,
      },
      orderBy: [{ familyName: "asc" }, { givenName: "asc" }],
      take: MAX_RESULTS,
    });

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        displayName: `${u.familyName} ${u.givenName}`,
        email: u.email,
      })),
    });
  } catch (error) {
    return jsonInternalError500(
      "GET api/clubs/.../technical-official/user-search",
      error
    );
  }
}
