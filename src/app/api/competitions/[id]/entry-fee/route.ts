import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

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

    // 権限チェック（OWNER または ADMIN のみ）
    const isAdmin = competition.organization.admins.some(
      (admin) =>
        admin.userId === session.userId &&
        (admin.role === "OWNER" || admin.role === "ADMIN")
    );

    if (!isAdmin) {
      return NextResponse.json(
        { message: "この操作を実行する権限がありません" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { baseFee, multiEventDiscount, teamOnlyFee } = body;

    // バリデーション
    if (typeof baseFee !== "number" || baseFee < 0) {
      return NextResponse.json(
        { message: "基本料金が正しくありません" },
        { status: 400 }
      );
    }

    if (multiEventDiscount) {
      if (!Array.isArray(multiEventDiscount)) {
        return NextResponse.json(
          { message: "複数種目割引の形式が正しくありません" },
          { status: 400 }
        );
      }

      for (const discount of multiEventDiscount) {
        if (
          typeof discount.minEvents !== "number" ||
          discount.minEvents < 2 ||
          typeof discount.discountedFee !== "number" ||
          discount.discountedFee < 0
        ) {
          return NextResponse.json(
            { message: "複数種目割引の設定が正しくありません" },
            { status: 400 }
          );
        }
      }
    }

    if (teamOnlyFee !== undefined && (typeof teamOnlyFee !== "number" || teamOnlyFee < 0)) {
      return NextResponse.json(
        { message: "チーム種目のみ料金が正しくありません" },
        { status: 400 }
      );
    }

    // エントリー費用設定を更新
    const entryFeeData = {
      baseFee,
      multiEventDiscount: multiEventDiscount || [],
      teamOnlyFee: teamOnlyFee || null,
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
    console.error("エントリー費用設定更新エラー:", error);
    return NextResponse.json(
      { message: "エントリー費用設定の更新に失敗しました" },
      { status: 500 }
    );
  }
}
