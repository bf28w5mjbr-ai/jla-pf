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
    const { id: competitionId } = await params;

    // セッション確認
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 大会の取得と権限確認
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
        { error: "大会が見つかりません" },
        { status: 404 }
      );
    }

    // 権限確認（管理者のみ）
    if (!hasOrgAdminAccess(competition.organization.admins)) {
      return NextResponse.json(
        { error: "大会を編集する権限がありません" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      nameKana,
      category,
      startDate,
      endDate,
      venue,
      venueAddress,
    } = body;

    // 必須フィールドのバリデーション
    if (
      typeof name !== "string" ||
      typeof startDate !== "string" ||
      typeof endDate !== "string" ||
      typeof venue !== "string" ||
      !name.trim() ||
      !startDate.trim() ||
      !endDate.trim() ||
      !venue.trim()
    ) {
      return NextResponse.json(
        { error: "必須項目が入力されていません" },
        { status: 400 }
      );
    }

    if (typeof category !== "string" || (category.trim() !== "プール" && category.trim() !== "オーシャン")) {
      return NextResponse.json(
        { error: "大会カテゴリはプールまたはオーシャンを指定してください" },
        { status: 400 }
      );
    }

    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);
    if (
      Number.isNaN(parsedStartDate.getTime()) ||
      Number.isNaN(parsedEndDate.getTime())
    ) {
      return NextResponse.json(
        { error: "日付の形式が不正です" },
        { status: 400 }
      );
    }
    if (parsedStartDate > parsedEndDate) {
      return NextResponse.json(
        { error: "終了日は開始日以降を指定してください" },
        { status: 400 }
      );
    }

    // 大会を更新
    const updatedCompetition = await prisma.competition.update({
      where: { id: competitionId },
      data: {
        name: name.trim(),
        nameKana: typeof nameKana === "string" ? nameKana.trim() || null : null,
        category: category.trim(),
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        venue: venue.trim(),
        venueAddress:
          typeof venueAddress === "string" ? venueAddress.trim() || null : null,
      },
    });

    return NextResponse.json({
      message: "大会を更新しました",
      competition: updatedCompetition,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/update/route.ts", error);
  }
}
