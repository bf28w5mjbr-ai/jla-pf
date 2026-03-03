import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await context.params;

    // セッション確認
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const {
      entryStartDate,
      entryEndDate,
      allowMultipleEventEntries,
      requireClubMembership,
      minAge,
      maxAge,
    } = body;

    // 大会の存在確認と権限チェック
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
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    // 権限チェック（OWNER または ADMIN のみ）
    const isAdmin = competition.organization.admins.some(
      (admin) =>
        admin.userId === session.userId &&
        (admin.role === "OWNER" || admin.role === "ADMIN")
    );

    if (!isAdmin) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    // エントリー期間の更新
    const updatedCompetition = await prisma.competition.update({
      where: { id: competitionId },
      data: {
        entryStartDate: entryStartDate ? new Date(entryStartDate) : null,
        entryEndDate: entryEndDate ? new Date(entryEndDate) : null,
        allowMultipleEventEntries:
          typeof allowMultipleEventEntries === "boolean"
            ? allowMultipleEventEntries
            : undefined,
        requireClubMembership:
          typeof requireClubMembership === "boolean"
            ? requireClubMembership
            : undefined,
        minAge: typeof minAge === "number" ? minAge : minAge === null ? null : undefined,
        maxAge: typeof maxAge === "number" ? maxAge : maxAge === null ? null : undefined,
      },
    });

    return NextResponse.json({
      message: "エントリー設定を更新しました",
      competition: updatedCompetition,
    });
  } catch (error) {
    console.error("エントリー設定の更新エラー:", error);
    return NextResponse.json(
      { message: "エントリー設定の更新に失敗しました" },
      { status: 500 }
    );
  }
}
