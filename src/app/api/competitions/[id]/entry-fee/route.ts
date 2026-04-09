import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import {
  assertEntryFeeEditable,
  CompetitionEditForbiddenError,
  loadCompetitionMutationState,
} from "@/lib/competitionPublishedEditRules";
import { isOrgAdminRole } from "@/lib/roleScopes";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// エントリー費用設定を更新
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  const { id: competitionId } = await context.params;
  
  try {
    // セッション確認
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    // 競技会の存在確認と権限チェック
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
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
      return NextResponse.json(
        { message: "競技会が見つかりません" },
        { status: 404 }
      );
    }

    // 権限チェック（管理者のみ）
    const isAdmin = competition.organization.admins.some(
      (admin) =>
        admin.userId === session.userId &&
        isOrgAdminRole(admin.role)
    );

    if (!isAdmin) {
      return NextResponse.json(
        { message: "この操作を実行する権限がありません" },
        { status: 403 }
      );
    }

    const mutationState = await loadCompetitionMutationState(competitionId);
    try {
      assertEntryFeeEditable(mutationState);
    } catch (e) {
      if (e instanceof CompetitionEditForbiddenError) {
        return NextResponse.json({ message: e.message }, { status: 400 });
      }
      throw e;
    }

    const body = await request.json();
    const { individualEntryFee, teamEntryFeePerTeam } = body;

    if (typeof individualEntryFee !== "number" || individualEntryFee < 0) {
      return NextResponse.json(
        { message: "個人エントリー料金が正しくありません" },
        { status: 400 }
      );
    }

    if (
      typeof teamEntryFeePerTeam !== "number" ||
      teamEntryFeePerTeam < 0
    ) {
      return NextResponse.json(
        { message: "チーム種目の1チームあたり料金が正しくありません" },
        { status: 400 }
      );
    }

    const entryFeeData = {
      individualEntryFee,
      teamEntryFeePerTeam,
    };

    const updatedCompetition = await prisma.competition.update({
      where: { id: competitionId },
      data: {
        entryFee: entryFeeData,
      },
    });

    return NextResponse.json({
      message: "エントリー費用設定を更新しました",
      entryFee: updatedCompetition.entryFee,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/entry-fee/route.ts", error);
  }
}
