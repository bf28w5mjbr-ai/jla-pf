import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id: competitionId, eventId } = await context.params;

    // セッション確認
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    // 種目の存在確認
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        competition: {
          include: {
            organization: {
              include: {
                admins: {
                  where: { userId: session.userId },
                },
              },
            },
          },
        },
      },
    });

    if (!event || event.competitionId !== competitionId) {
      return NextResponse.json({ message: "種目が見つかりません" }, { status: 404 });
    }

    // 権限チェック（OWNER または ADMIN のみ）
    const isAdmin = event.competition.organization.admins.some(
      (admin) =>
        admin.userId === session.userId &&
        (admin.role === "OWNER" || admin.role === "ADMIN")
    );

    if (!isAdmin) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    // 同じ種目名の男女両方を削除
    await prisma.event.deleteMany({
      where: {
        competitionId,
        name: event.name,
      },
    });

    // 更新後の種目一覧を取得
    const updatedEvents = await prisma.event.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({
      message: "種目を削除しました",
      events: updatedEvents,
    });
  } catch (error) {
    console.error("種目削除エラー:", error);
    return NextResponse.json(
      { message: "種目の削除に失敗しました" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id: competitionId, eventId } = await context.params;

    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        competition: {
          include: {
            organization: {
              include: {
                admins: {
                  where: { userId: session.userId },
                },
              },
            },
          },
        },
      },
    });

    if (!event || event.competitionId !== competitionId) {
      return NextResponse.json({ message: "種目が見つかりません" }, { status: 404 });
    }

    const isAdmin = event.competition.organization.admins.some(
      (admin) =>
        admin.userId === session.userId &&
        (admin.role === "OWNER" || admin.role === "ADMIN")
    );

    if (!isAdmin) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    const body = await request.json();
    const { minAge, maxAge } = body ?? {};

    if (minAge !== null && minAge !== undefined && (typeof minAge !== "number" || minAge < 0)) {
      return NextResponse.json({ message: "最小年齢が不正です" }, { status: 400 });
    }

    if (maxAge !== null && maxAge !== undefined && (typeof maxAge !== "number" || maxAge < 0)) {
      return NextResponse.json({ message: "最大年齢が不正です" }, { status: 400 });
    }

    if (
      minAge !== null &&
      minAge !== undefined &&
      maxAge !== null &&
      maxAge !== undefined &&
      minAge > maxAge
    ) {
      return NextResponse.json({ message: "最小年齢は最大年齢以下にしてください" }, { status: 400 });
    }

    await prisma.event.updateMany({
      where: {
        competitionId,
        name: event.name,
      },
      data: {
        minAge: minAge === undefined ? undefined : minAge,
        maxAge: maxAge === undefined ? undefined : maxAge,
      },
    });

    const updatedEvents = await prisma.event.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({
      message: "種目の年齢条件を更新しました",
      events: updatedEvents,
    });
  } catch (error) {
    console.error("種目年齢条件更新エラー:", error);
    return NextResponse.json(
      { message: "種目の年齢条件の更新に失敗しました" },
      { status: 500 }
    );
  }
}
