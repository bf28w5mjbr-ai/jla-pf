import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

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

    // 権限確認（OWNER または ADMIN）
    const userRole = competition.organization.admins[0]?.role;
    if (userRole !== "OWNER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "大会を編集する権限がありません" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      nameKana,
      startDate,
      endDate,
      venue,
      venueAddress,
    } = body;

    // 必須フィールドのバリデーション
    if (!name || !startDate || !endDate || !venue) {
      return NextResponse.json(
        { error: "必須項目が入力されていません" },
        { status: 400 }
      );
    }

    // 大会を更新
    const updatedCompetition = await prisma.competition.update({
      where: { id: competitionId },
      data: {
        name,
        nameKana: nameKana || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        venue,
        venueAddress: venueAddress || null,
      },
    });

    return NextResponse.json({
      message: "大会を更新しました",
      competition: updatedCompetition,
    });
  } catch (error) {
    console.error("Update competition error:", error);
    return NextResponse.json(
      { error: "大会の更新に失敗しました" },
      { status: 500 }
    );
  }
}
