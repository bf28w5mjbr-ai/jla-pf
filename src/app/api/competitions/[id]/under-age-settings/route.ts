import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  assertUnderAgeSettingsEditable,
  CompetitionEditForbiddenError,
  loadCompetitionMutationState,
} from "@/lib/competitionPublishedEditRules";
import { isOrgAdminRole } from "@/lib/roleScopes";
import { buildAgeCategoryTemplateRows } from "@/lib/seasonalAgeToBirthDateRange";

type RouteContext = { params: Promise<{ id: string }> };

function normalizeThresholds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const xs = raw
    .map((x) => (typeof x === "number" ? Math.floor(x) : NaN))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 150);
  return Array.from(new Set(xs)).sort((a, b) => a - b);
}

/**
 * 「アンダー制」をテンプレートとして AGEカテゴリに反映する。
 * 既存カテゴリと **名前** で突き合わせ:
 *   - 同名があれば eligibleBirthDateFrom / eligibleBirthDateTo / displayOrder を上書き
 *   - 無ければ追加
 * テンプレ外の既存カテゴリは触らない（手動追加分の保護）。
 * applyTemplate=false のときは何もしない（フラグ・しきい値のみ保存）。
 */
async function syncAgeCategoriesFromUnderAgeTemplate(
  competitionId: string,
  competitionStartDate: Date,
  uThresholds: number[],
  openEnabled: boolean
): Promise<void> {
  const rows = buildAgeCategoryTemplateRows(competitionStartDate, uThresholds, openEnabled);
  if (rows.length === 0) return;

  const existing = await prisma.competitionAgeCategory.findMany({
    where: { competitionId },
    orderBy: { displayOrder: "asc" },
  });
  const byName = new Map(existing.map((c) => [c.name, c] as const));
  // テンプレ行は U の昇順 + OPEN を最後にする（buildAgeCategoryTemplateRows の出力順）。
  // 既存カテゴリで「テンプレ範囲名」と一致しないものは末尾に維持する。
  const templateNames = new Set(rows.map((r) => r.name));

  // テンプレ行の displayOrder を 0,1,2,... と振り直し
  let order = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const exists = byName.get(row.name);
      if (exists) {
        await tx.competitionAgeCategory.update({
          where: { id: exists.id },
          data: {
            displayOrder: order,
            eligibleBirthDateFrom: row.eligibleBirthDateFrom,
            eligibleBirthDateTo: row.eligibleBirthDateTo,
          },
        });
      } else {
        await tx.competitionAgeCategory.create({
          data: {
            competitionId,
            name: row.name,
            displayOrder: order,
            eligibleBirthDateFrom: row.eligibleBirthDateFrom,
            eligibleBirthDateTo: row.eligibleBirthDateTo,
          },
        });
      }
      order += 1;
    }
    // テンプレ外の既存カテゴリは displayOrder を末尾に振り直す（順序保持）
    const extras = existing.filter((c) => !templateNames.has(c.name));
    for (const c of extras) {
      await tx.competitionAgeCategory.update({
        where: { id: c.id },
        data: { displayOrder: order },
      });
      order += 1;
    }
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
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

    const body = (await request.json().catch(() => ({}))) as {
      underAgeSystemEnabled?: unknown;
      underAgeUThresholds?: unknown;
      underAgeOpenEnabled?: unknown;
      /** true のとき AGEカテゴリへ一括反映（テンプレからの生成/同期）も行う */
      applyTemplate?: unknown;
    };

    const underAgeSystemEnabled = body.underAgeSystemEnabled === true;
    const underAgeUThresholds = normalizeThresholds(body.underAgeUThresholds);
    const underAgeOpenEnabled = body.underAgeOpenEnabled !== false;
    const applyTemplate = body.applyTemplate === true;

    const mutationState = await loadCompetitionMutationState(competitionId);
    try {
      assertUnderAgeSettingsEditable(
        competition,
        { underAgeSystemEnabled, underAgeUThresholds, underAgeOpenEnabled },
        mutationState
      );
    } catch (e) {
      if (e instanceof CompetitionEditForbiddenError) {
        return NextResponse.json({ message: e.message }, { status: 400 });
      }
      throw e;
    }

    const updated = await prisma.competition.update({
      where: { id: competitionId },
      data: {
        underAgeSystemEnabled,
        underAgeUThresholds,
        underAgeOpenEnabled,
      },
    });

    let appliedAgeCategoryCount = 0;
    if (applyTemplate && underAgeSystemEnabled && competition.startDate) {
      await syncAgeCategoriesFromUnderAgeTemplate(
        competitionId,
        competition.startDate,
        underAgeUThresholds,
        underAgeOpenEnabled
      );
      const rows = buildAgeCategoryTemplateRows(
        competition.startDate,
        underAgeUThresholds,
        underAgeOpenEnabled
      );
      appliedAgeCategoryCount = rows.length;
    }

    return NextResponse.json({
      message: applyTemplate
        ? `アンダー制テンプレートを保存し、AGEカテゴリ ${appliedAgeCategoryCount} 件に反映しました`
        : "アンダー制テンプレートを保存しました",
      underAgeSystemEnabled: updated.underAgeSystemEnabled,
      underAgeUThresholds: updated.underAgeUThresholds,
      underAgeOpenEnabled: updated.underAgeOpenEnabled,
      appliedAgeCategoryCount,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/under-age-settings/route.ts", error);
  }
}
