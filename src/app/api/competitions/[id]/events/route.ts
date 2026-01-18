import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await context.params;

    // 種目一覧を取得
    const events = await prisma.event.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("種目取得エラー:", error);
    return NextResponse.json(
      { message: "種目の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const { name, type = "INDIVIDUAL", category = "POOL" } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ message: "種目名を入力してください" }, { status: 400 });
    }

    if (type !== "INDIVIDUAL" && type !== "TEAM") {
      return NextResponse.json({ message: "種目タイプが不正です" }, { status: 400 });
    }

    if (category !== "POOL" && category !== "OCEAN") {
      return NextResponse.json({ message: "競技カテゴリが不正です" }, { status: 400 });
    }

    // エントリータイム必須フラグ（プール競技は必須、オーシャンは不要）
    const requiresEntryTime = category === "POOL";

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
        events: {
          orderBy: { displayOrder: "asc" },
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

    // 同じ種目名が既に存在するかチェック（種目タイプとカテゴリも含めて）
    const existingEvent = competition.events.find(
      (event) => 
        event.name.toLowerCase() === name.trim().toLowerCase() &&
        event.type === type &&
        event.category === category
    );

    if (existingEvent) {
      const categoryLabel = category === "POOL" ? "プール" : "オーシャン";
      const typeLabel = type === "INDIVIDUAL" ? "個人" : "チーム";
      return NextResponse.json(
        { message: `${categoryLabel}${typeLabel}種目「${name.trim()}」は既に登録されています` },
        { status: 400 }
      );
    }

    // 現在の最大displayOrderを取得
    const maxDisplayOrder = competition.events.length > 0
      ? Math.max(...competition.events.map((e) => e.displayOrder))
      : -1;

    // 男子と女子の2つの種目を作成
    await prisma.$transaction([
      prisma.event.create({
        data: {
          competitionId,
          name: name.trim(),
          sex: "MALE",
          type,
          category,
          requiresEntryTime,
          displayOrder: maxDisplayOrder + 1,
        },
      }),
      prisma.event.create({
        data: {
          competitionId,
          name: name.trim(),
          sex: "FEMALE",
          type,
          category,
          requiresEntryTime,
          displayOrder: maxDisplayOrder + 2,
        },
      }),
    ]);

    // 更新後の種目一覧を取得
    const updatedEvents = await prisma.event.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({
      message: "種目を追加しました",
      events: updatedEvents,
    });
  } catch (error) {
    console.error("種目追加エラー:", error);
    return NextResponse.json(
      { message: "種目の追加に失敗しました" },
      { status: 500 }
    );
  }
}
