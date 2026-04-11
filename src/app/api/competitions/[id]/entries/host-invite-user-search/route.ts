import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";

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

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      organization: {
        select: {
          admins: {
            where: { userId: session.userId },
            select: { role: true },
          },
        },
      },
    },
  });

  if (!competition) {
    return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
  }

  if (!hasOrgAdminAccess(competition.organization.admins)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { phoneNumber: { contains: q } },
        { familyName: { contains: q } },
        { givenName: { contains: q } },
      ],
    },
    select: {
      id: true,
      familyName: true,
      givenName: true,
      email: true,
      phoneNumber: true,
      sex: true,
    },
    take: 20,
    orderBy: [{ familyName: "asc" }, { givenName: "asc" }],
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      displayName: `${u.familyName} ${u.givenName}`,
      email: u.email,
      phoneNumber: u.phoneNumber,
      sex: u.sex,
    })),
  });
}
