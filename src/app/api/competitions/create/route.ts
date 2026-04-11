import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requireOrgAdmin } from "@/lib/accessControl";

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
    if (!organizationId || !name?.trim()) {
      return NextResponse.json(
        { error: "必須項目が入力されていません" },
        { status: 400 }
      );
    }

    // 団体への権限を確認（管理者のみ）
    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "大会を作成する権限がありません" },
        { status: 403 }
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        status: true,
        name: true,
        nameKana: true,
        abbreviation: true,
      },
    });
    if (!organization || organization.status !== "APPROVED") {
      return NextResponse.json(
        {
          error:
            "正式化済みの大会開催者のみ大会を作成できます。開催団体の登録手続き（オンボーディング）を完了してください。",
        },
        { status: 403 }
      );
    }

    const parseDateOrDefault = (value: unknown, fallback: Date) => {
      if (typeof value !== "string" || value.trim().length === 0) {
        return fallback;
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? fallback : parsed;
    };

    const defaultStartDate = new Date();
    const defaultEndDate = new Date(defaultStartDate);
    defaultEndDate.setDate(defaultEndDate.getDate() + 1);
    const parsedStartDate = parseDateOrDefault(startDate, defaultStartDate);
    const parsedEndDate = parseDateOrDefault(endDate, defaultEndDate);

    // 大会を作成
    const competition = await prisma.competition.create({
      data: {
        organizationId,
        hostOrganizationName: organization.name,
        hostOrganizationNameKana: organization.nameKana,
        hostOrganizationAbbreviation: organization.abbreviation,
        name: name.trim(),
        nameKana,
        description,
        category,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        venue: typeof venue === "string" ? venue : "",
        venueAddress,
        entryStartDate: entryStartDate ? new Date(entryStartDate) : null,
        entryEndDate: entryEndDate ? new Date(entryEndDate) : null,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
        entryFee:
          typeof entryFee === "number"
            ? {
                individualEntryFee: entryFee,
                teamEntryFeePerTeam: 0,
              }
            : entryFee && typeof entryFee === "object"
              ? entryFee
              : undefined,
        status: "DRAFT",
        isPublished: false,
      },
    });

    return NextResponse.json({
      message: "大会を作成しました",
      competition,
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/create/route.ts", error);
  }
}
