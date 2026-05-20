import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";

type OfficialPosition = {
  positionName: string;
  count: number;
};

export async function PUT(
  request: Request,
  context: { params: Promise<{ orgId: string; competitionId: string }> }
) {
  try {
    const { orgId: organizationId, competitionId } = await context.params;
    const cookieStore = (await import("next/headers")).cookies();
    const token = (await cookieStore).get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    // 組織の管理者権限チェック
    try {
      await requireOrgAdmin(organizationId, session.userId, "operational");
    } catch {
      return NextResponse.json(
        { error: "この操作を実行する権限がありません" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { positions } = body as { positions: OfficialPosition[] };

    // バリデーション
    if (!Array.isArray(positions)) {
      return NextResponse.json(
        { error: "無効なデータ形式です" },
        { status: 400 }
      );
    }

    for (const position of positions) {
      if (
        typeof position.positionName !== "string" ||
        !position.positionName.trim() ||
        typeof position.count !== "number" ||
        position.count < 1
      ) {
        return NextResponse.json(
          { error: "ポジション名と募集人数が正しく入力されていません" },
          { status: 400 }
        );
      }
    }

    // Competitionの更新
    const competition = await prisma.competition.update({
      where: {
        id: competitionId,
        organizationId,
      },
      data: {
        officialPositions: positions,
      },
    });

    return NextResponse.json({
      success: true,
      officialPositions: competition.officialPositions,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/organizations/[orgId]/competitions/[competitionId]/official-positions/route.ts", error);
  }
}
