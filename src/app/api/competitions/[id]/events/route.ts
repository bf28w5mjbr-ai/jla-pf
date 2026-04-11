import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requireOrgAdmin } from "@/lib/accessControl";
import {
  announceCompetitionRuleChange,
  assertEventAddAllowed,
  CompetitionEditForbiddenError,
  loadCompetitionMutationState,
} from "@/lib/competitionPublishedEditRules";
import { isOrgAdminRole } from "@/lib/roleScopes";
import { resolveCompetitionEventCategoryScope } from "@/lib/competitionEventCategoryScope";
import { buildStoredCompetitionEventName } from "@/lib/competitionEventStoredName";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await context.params;
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        organizationId: true,
        status: true,
        isPublished: true,
      },
    });

    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    const isPublished =
      competition.status === "PUBLISHED" || competition.isPublished;
    if (!isPublished) {
      const token = request.cookies.get("session")?.value;
      const session = token ? await verifySession(token) : null;
      if (!session?.userId) {
        return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
      }
      try {
        await requireOrgAdmin(competition.organizationId, session.userId);
      } catch {
        return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
      }
    }

    // 種目一覧を取得
    const events = await prisma.event.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({ events });
  } catch (error) {
    return jsonInternalError500("GET api/competitions/[id]/events/route.ts", error);
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

    const body = (await request.json()) as {
      name?: unknown;
      type?: unknown;
      category?: unknown;
      sexOption?: unknown;
      announcementMessage?: unknown;
      ageCategoryId?: unknown;
    };
    const {
      name,
      type = "INDIVIDUAL",
      category = "POOL",
      sexOption = "BOTH",
      announcementMessage,
      ageCategoryId: rawAgeCategoryId,
    } = body;

    const targetAgeCategoryId =
      typeof rawAgeCategoryId === "string" && rawAgeCategoryId.trim()
        ? rawAgeCategoryId.trim()
        : null;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ message: "種目名を入力してください" }, { status: 400 });
    }

    if (type !== "INDIVIDUAL" && type !== "TEAM") {
      return NextResponse.json({ message: "種目タイプが不正です" }, { status: 400 });
    }

    if (category !== "POOL" && category !== "OCEAN") {
      return NextResponse.json({ message: "競技カテゴリが不正です" }, { status: 400 });
    }

    if (
      sexOption !== "BOTH" &&
      sexOption !== "MALE_ONLY" &&
      sexOption !== "FEMALE_ONLY" &&
      sexOption !== "MIXED_ONLY"
    ) {
      return NextResponse.json({ message: "性別指定が不正です" }, { status: 400 });
    }

    const sexesToCreate =
      sexOption === "MALE_ONLY"
        ? (["MALE"] as const)
        : sexOption === "FEMALE_ONLY"
          ? (["FEMALE"] as const)
          : sexOption === "MIXED_ONLY"
            ? (["OTHER"] as const)
            : (["MALE", "FEMALE"] as const);

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

    let resolvedAgeCategory: Awaited<
      ReturnType<typeof prisma.competitionAgeCategory.findFirst>
    > = null;
    if (targetAgeCategoryId) {
      resolvedAgeCategory = await prisma.competitionAgeCategory.findFirst({
        where: { id: targetAgeCategoryId, competitionId },
      });
      if (!resolvedAgeCategory) {
        return NextResponse.json({ message: "年齢カテゴリが見つかりません" }, { status: 404 });
      }
    }

    // 権限チェック（管理者のみ）
    const isAdmin = competition.organization.admins.some(
      (admin) =>
        admin.userId === session.userId &&
        isOrgAdminRole(admin.role)
    );

    if (!isAdmin) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    const categoryScope = resolveCompetitionEventCategoryScope(competition.category);
    if (categoryScope === "POOL_ONLY" && category !== "POOL") {
      return NextResponse.json(
        { message: "この大会カテゴリではプール競技のみ登録できます" },
        { status: 400 }
      );
    }
    if (categoryScope === "OCEAN_ONLY" && category !== "OCEAN") {
      return NextResponse.json(
        { message: "この大会カテゴリではオーシャン競技のみ登録できます" },
        { status: 400 }
      );
    }

    const mutationState = await loadCompetitionMutationState(competitionId);
    const announce =
      typeof announcementMessage === "string" ? announcementMessage.trim() : undefined;
    try {
      assertEventAddAllowed(mutationState, announce);
    } catch (e) {
      if (e instanceof CompetitionEditForbiddenError) {
        return NextResponse.json({ message: e.message }, { status: 400 });
      }
      throw e;
    }

    const storedEventName = buildStoredCompetitionEventName({
      tabInnerName: name.trim(),
      ageCategoryId: targetAgeCategoryId,
      ageCategoryName: resolvedAgeCategory?.name ?? null,
    });

    const sameNameEvents = competition.events.filter(
      (event) =>
        event.name.toLowerCase() === storedEventName.toLowerCase() &&
        event.type === type &&
        event.category === category &&
        (event.ageCategoryId ?? null) === targetAgeCategoryId
    );
    const existingSexes = new Set(sameNameEvents.map((event) => event.sex));
    const missingSexes = sexesToCreate.filter((sex) => !existingSexes.has(sex));

    if (missingSexes.length === 0) {
      const categoryLabel = category === "POOL" ? "プール" : "オーシャン";
      const typeLabel = type === "INDIVIDUAL" ? "個人" : "チーム";
      return NextResponse.json(
        { message: `${categoryLabel}${typeLabel}種目「${name.trim()}」は既に登録されています` },
        { status: 400 }
      );
    }

    const bucketEvents = competition.events.filter(
      (e) => (e.ageCategoryId ?? null) === targetAgeCategoryId
    );
    const maxDisplayOrder =
      bucketEvents.length > 0 ? Math.max(...bucketEvents.map((e) => e.displayOrder)) : -1;

    const birthForCreate = resolvedAgeCategory
      ? {
          eligibleBirthDateFrom: resolvedAgeCategory.eligibleBirthDateFrom,
          eligibleBirthDateTo: resolvedAgeCategory.eligibleBirthDateTo,
          minAge: null as number | null,
          maxAge: null as number | null,
        }
      : {};

    await prisma.$transaction(
      missingSexes.map((sex, index) =>
        prisma.event.create({
          data: {
            competitionId,
            ageCategoryId: targetAgeCategoryId,
            name: storedEventName,
            sex,
            type,
            category,
            requiresEntryTime,
            displayOrder: maxDisplayOrder + index + 1,
            ...birthForCreate,
          },
        })
      )
    );

    if (announce && mutationState.isPublished && mutationState.hasEstablishedEntry) {
      await announceCompetitionRuleChange({
        competitionId,
        title: `${competition.name} に種目が追加されました`,
        body: announce,
      });
    }

    // 更新後の種目一覧を取得
    const updatedEvents = await prisma.event.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({
      message: `種目を追加しました（${
        sexOption === "MALE_ONLY"
          ? "男子"
          : sexOption === "FEMALE_ONLY"
            ? "女子"
            : sexOption === "MIXED_ONLY"
              ? "混合"
              : "男子・女子"
      }）`,
      events: updatedEvents,
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/events/route.ts", error);
  }
}
