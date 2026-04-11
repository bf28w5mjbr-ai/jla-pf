import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 大会情報を取得
    const competition = await prisma.competition.findUnique({
      where: { id },
      include: {
        organization: {
          include: {
            admins: {
              where: { userId: session.userId },
            },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    // 権限確認（管理者のみ）
    if (!hasOrgAdminAccess(competition.organization.admins)) {
      return NextResponse.json(
        { error: "編集権限がありません" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { sponsors, cooperators, supporters, grants } = body;

    // 更新
    const updatedCompetition = await prisma.competition.update({
      where: { id },
      data: {
        sponsors: sponsors || null,
        cooperators: cooperators || null,
        supporters: supporters || null,
        grants: grants || null,
      },
    });

    return NextResponse.json({
      message: "関係組織情報を更新しました",
      competition: updatedCompetition,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/relations/route.ts", error);
  }
}
