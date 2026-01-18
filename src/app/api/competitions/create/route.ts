import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function POST(request: NextRequest) {
  try {
    // セッション確認
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const {
      organizationId,
      name,
      nameKana,
      description,
      category,
      startDate,
      endDate,
      venue,
      venueAddress,
      entryStartDate,
      entryEndDate,
      maxParticipants,
      entryFee,
    } = body;

    // 必須フィールドのバリデーション
    if (!organizationId || !name || !startDate || !endDate || !venue) {
      return NextResponse.json(
        { error: "必須項目が入力されていません" },
        { status: 400 }
      );
    }

    // 団体への権限を確認（OWNER または ADMIN）
    const orgAdmin = await prisma.orgAdmin.findFirst({
      where: {
        userId: session.userId,
        organizationId,
        role: {
          in: ["OWNER", "ADMIN"],
        },
      },
    });

    if (!orgAdmin) {
      return NextResponse.json(
        { error: "大会を作成する権限がありません" },
        { status: 403 }
      );
    }

    // 大会を作成
    const competition = await prisma.competition.create({
      data: {
        organizationId,
        name,
        nameKana,
        description,
        category,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        venue,
        venueAddress,
        entryStartDate: entryStartDate ? new Date(entryStartDate) : null,
        entryEndDate: entryEndDate ? new Date(entryEndDate) : null,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
        entryFee: entryFee ? parseInt(entryFee) : null,
        status: "DRAFT",
        isPublished: false,
      },
    });

    return NextResponse.json({
      message: "大会を作成しました",
      competition,
    });
  } catch (error) {
    console.error("Create competition error:", error);
    return NextResponse.json(
      { error: "大会の作成に失敗しました" },
      { status: 500 }
    );
  }
}
