import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  assertEventAgePatchAllowed,
  CompetitionEditForbiddenError,
  loadCompetitionMutationState,
} from "@/lib/competitionPublishedEditRules";
import { isOrgAdminRole } from "@/lib/roleScopes";
import {
  normalizeUnderAgeThresholds,
  syncAgeCategoriesFromUnderAge,
} from "@/lib/competitionAgeCategoryFromUnderAge";
import { buildAgeCategoryTemplateRows } from "@/lib/seasonalAgeToBirthDateRange";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;

    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        organization: {
          include: {
            admins: { where: { userId: session.userId } },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    const isAdmin = competition.organization.admins.some(
      (a) => a.userId === session.userId && isOrgAdminRole(a.role)
    );
    if (!isAdmin) {
      return NextResponse.json({ message: "この操作を実行する権限がありません" }, { status: 403 });
    }

    if (!competition.startDate) {
      return NextResponse.json(
        { message: "大会開始日が未設定のため、アンダー制でカテゴリを生成できません" },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      uThresholds?: unknown;
      openEnabled?: unknown;
    };

    const uThresholds = normalizeUnderAgeThresholds(body.uThresholds);
    const openEnabled = body.openEnabled !== false;

    const templateRows = buildAgeCategoryTemplateRows(
      competition.startDate,
      uThresholds,
      openEnabled
    );
    if (templateRows.length === 0) {
      return NextResponse.json(
        { message: "生成できるカテゴリがありません。U のしきい値または OPEN を確認してください" },
        { status: 400 }
      );
    }

    const existingCount = await prisma.competitionAgeCategory.count({
      where: { competitionId },
    });
    if (existingCount > 0) {
      const mutationState = await loadCompetitionMutationState(competitionId);
      try {
        assertEventAgePatchAllowed(mutationState);
      } catch (e) {
        if (e instanceof CompetitionEditForbiddenError) {
          return NextResponse.json({ message: e.message }, { status: 400 });
        }
        throw e;
      }
    }

    const appliedCount = await syncAgeCategoriesFromUnderAge(
      competitionId,
      competition.startDate,
      uThresholds,
      openEnabled
    );

    const ageCategories = await prisma.competitionAgeCategory.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({
      message: `AGEカテゴリ ${appliedCount} 件をアンダー制で追加・更新しました`,
      appliedCount,
      ageCategories,
    });
  } catch (error) {
    return jsonInternalError500(
      "POST api/competitions/[id]/age-categories/generate-from-under-age/route.ts",
      error
    );
  }
}
