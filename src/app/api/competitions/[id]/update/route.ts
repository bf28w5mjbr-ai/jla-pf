import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  hostOrgAdminGateJsonError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";
import { revalidateCompetitionPublicPage } from "@/lib/revalidateCompetitionPublicPage";

function isOwnProp(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

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

    try {
      await requireHostOrgAdminForCompetition(competitionId, session.userId);
    } catch (e) {
      const gated = hostOrgAdminGateJsonError(e);
      if (gated) {
        return NextResponse.json({ error: gated.error }, { status: gated.status });
      }
      throw e;
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
    });

    if (!competition) {
      return NextResponse.json(
        { error: "大会が見つかりません" },
        { status: 404 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    const touchesBasicBundle =
      isOwnProp(body, "venue") ||
      isOwnProp(body, "category") ||
      isOwnProp(body, "startDate") ||
      isOwnProp(body, "endDate");

    /** 基本情報カード以外からの大会名のみ更新（未入力の場所・カテゴリがあっても可） */
    if (!touchesBasicBundle) {
      if (!isOwnProp(body, "name") || typeof body.name !== "string") {
        return NextResponse.json({ error: "大会名が必要です" }, { status: 400 });
      }
      const nextName = body.name.trim();
      if (!nextName) {
        return NextResponse.json({ error: "大会名を入力してください" }, { status: 400 });
      }

      const data: { name: string; nameKana?: string | null } = { name: nextName };
      if (isOwnProp(body, "nameKana") && typeof body.nameKana === "string") {
        data.nameKana = body.nameKana.trim() || null;
      }

      const updatedCompetition = await prisma.competition.update({
        where: { id: competitionId },
        data,
      });

      return NextResponse.json({
        message: "大会を更新しました",
        competition: updatedCompetition,
      });
    }

    const {
      name,
      nameKana,
      category,
      startDate,
      endDate,
      venue,
      venueAddress,
    } = body as {
      name?: unknown;
      nameKana?: unknown;
      category?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      venue?: unknown;
      venueAddress?: unknown;
    };

    const nextName =
      typeof name === "string" ? name.trim() : competition.name?.trim() ?? "";
    const nextCategory =
      typeof category === "string" ? category.trim() : competition.category?.trim() ?? "";
    const nextStartDateRaw =
      typeof startDate === "string"
        ? startDate.trim()
        : competition.startDate.toISOString().slice(0, 10);
    const nextEndDateRaw =
      typeof endDate === "string"
        ? endDate.trim()
        : competition.endDate.toISOString().slice(0, 10);
    const nextVenue =
      typeof venue === "string" ? venue.trim() : competition.venue?.trim() ?? "";

    // 必須フィールドのバリデーション（基本情報カードの一括更新）
    if (
      !nextName ||
      !nextStartDateRaw ||
      !nextEndDateRaw ||
      !nextVenue
    ) {
      return NextResponse.json(
        { error: "必須項目が入力されていません" },
        { status: 400 }
      );
    }

    if (nextCategory !== "プール" && nextCategory !== "オーシャン") {
      return NextResponse.json(
        { error: "大会カテゴリはプールまたはオーシャンを指定してください" },
        { status: 400 }
      );
    }

    const parsedStartDate = new Date(nextStartDateRaw);
    const parsedEndDate = new Date(nextEndDateRaw);
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
        name: nextName,
        nameKana:
          typeof nameKana === "string"
            ? nameKana.trim() || null
            : competition.nameKana,
        category: nextCategory,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        venue: nextVenue,
        venueAddress:
          typeof venueAddress === "string"
            ? venueAddress.trim() || null
            : competition.venueAddress,
      },
    });

    revalidateCompetitionPublicPage(competitionId);

    return NextResponse.json({
      competition: updatedCompetition,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/update/route.ts", error);
  }
}
