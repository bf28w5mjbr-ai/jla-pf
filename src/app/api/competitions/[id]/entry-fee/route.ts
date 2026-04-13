import { jsonInternalError500 } from "@/lib/apiInternalError";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import {
  assertEntryFeeEditable,
  CompetitionEditForbiddenError,
  loadCompetitionMutationState,
} from "@/lib/competitionPublishedEditRules";
import {
  normalizeAgeCategoryFeeTiersInput,
  parseUnderFeeTiers,
  validateAgeFeeTiersCoverCompetitionRange,
  validateAgeTiersNoOverlap,
  validateUnderFeeTiersAgainstPartition,
  type AgeFeeTier,
} from "@/lib/competitionEntryAgeTiered";
import { partitionUnderBandsForCompetition } from "@/lib/competitionUnderAgeSettings";
import { eventUsesBirthDateRange } from "@/lib/eventBirthDateEligibility";
import { isOrgAdminRole } from "@/lib/roleScopes";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseAgeFeeTiersFromBody(items: unknown[]): AgeFeeTier[] | null {
  const out: AgeFeeTier[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const t = item as Record<string, unknown>;
    const minAge = typeof t.minAge === "number" ? Math.floor(t.minAge) : NaN;
    const maxAge =
      t.maxAge === null || t.maxAge === undefined
        ? null
        : typeof t.maxAge === "number"
          ? Math.floor(t.maxAge)
          : NaN;
    const individualEntryFee =
      typeof t.individualEntryFee === "number" ? t.individualEntryFee : NaN;
    const teamEntryFeePerTeam =
      typeof t.teamEntryFeePerTeam === "number" ? t.teamEntryFeePerTeam : NaN;
    if (!Number.isFinite(minAge) || minAge < 0) continue;
    if (maxAge !== null && (!Number.isFinite(maxAge) || maxAge < minAge)) continue;
    if (!Number.isFinite(individualEntryFee) || individualEntryFee < 0) continue;
    if (!Number.isFinite(teamEntryFeePerTeam) || teamEntryFeePerTeam < 0) continue;
    out.push({ minAge, maxAge, individualEntryFee, teamEntryFeePerTeam });
  }
  return out.length > 0 ? out : null;
}

// エントリー費用設定を更新
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  const { id: competitionId } = await context.params;
  
  try {
    // セッション確認
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    // 競技会の存在確認と権限チェック
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
        { message: "競技会が見つかりません" },
        { status: 404 }
      );
    }

    // 権限チェック（管理者のみ）
    const isAdmin = competition.organization.admins.some(
      (admin) =>
        admin.userId === session.userId &&
        isOrgAdminRole(admin.role)
    );

    if (!isAdmin) {
      return NextResponse.json(
        { message: "この操作を実行する権限がありません" },
        { status: 403 }
      );
    }

    const mutationState = await loadCompetitionMutationState(competitionId);
    try {
      assertEntryFeeEditable(mutationState);
    } catch (e) {
      if (e instanceof CompetitionEditForbiddenError) {
        return NextResponse.json({ message: e.message }, { status: 400 });
      }
      throw e;
    }

    const body = await request.json().catch(() => ({})) as {
      pricingMode?: unknown;
      individualEntryFee?: unknown;
      teamEntryFeePerTeam?: unknown;
      ageFeeTiers?: unknown;
      ageCategoryFeeTiers?: unknown;
      underFeeTiers?: unknown;
    };

    let entryFeeData: Prisma.InputJsonValue;

    if (body.pricingMode === "byAgeCategory") {
      if (!Array.isArray(body.ageCategoryFeeTiers)) {
        return NextResponse.json(
          { message: "年齢カテゴリ別参加費の形式が正しくありません" },
          { status: 400 }
        );
      }
      const tiers = normalizeAgeCategoryFeeTiersInput(body.ageCategoryFeeTiers);
      if (!tiers) {
        return NextResponse.json(
          { message: "年齢カテゴリ別の料金を1件以上、正しい形式で指定してください" },
          { status: 400 }
        );
      }

      const categories = await prisma.competitionAgeCategory.findMany({
        where: { competitionId },
        orderBy: { displayOrder: "asc" },
      });
      if (categories.length === 0) {
        return NextResponse.json(
          {
            message:
              "年齢カテゴリがまだありません。種目設定の「カテゴリ管理」でカテゴリと生年月日の範囲を作成してから、カテゴリ別の参加費を設定してください。",
          },
          { status: 400 }
        );
      }

      const missingBirthRange = categories.some((c) => !eventUsesBirthDateRange(c));
      if (missingBirthRange) {
        return NextResponse.json(
          {
            message:
              "カテゴリ別の参加費を使うには、すべての年齢カテゴリに生年月日の範囲（下限・上限のいずれか）を設定してください（カテゴリ管理タブ）。",
          },
          { status: 400 }
        );
      }

      const expectedIds = new Set(categories.map((c) => c.id));
      const gotIds = new Set(tiers.map((t) => t.ageCategoryId));
      if (expectedIds.size !== gotIds.size) {
        return NextResponse.json(
          {
            message:
              "登録されている各年齢カテゴリにつき1行ずつ、参加費を指定してください（不足または余分な行があります）。",
          },
          { status: 400 }
        );
      }
      for (const id of expectedIds) {
        if (!gotIds.has(id)) {
          return NextResponse.json(
            {
              message:
                "登録されている各年齢カテゴリにつき1行ずつ、参加費を指定してください（不足または余分な行があります）。",
            },
            { status: 400 }
          );
        }
      }

      entryFeeData = { ageCategoryFeeTiers: tiers };
    } else if (body.pricingMode === "byUnderAge") {
      if (!competition.underAgeSystemEnabled) {
        return NextResponse.json(
          {
            message:
              "アンダー別の参加費を使うには、先に「年齢・所属クラブ」で大会のアンダー制を有効にしてください。",
          },
          { status: 400 }
        );
      }
      if (!Array.isArray(body.underFeeTiers)) {
        return NextResponse.json(
          { message: "アンダー別参加費の形式が正しくありません" },
          { status: 400 }
        );
      }
      const tiers = parseUnderFeeTiers({ underFeeTiers: body.underFeeTiers });
      if (!tiers) {
        return NextResponse.json(
          { message: "アンダー別の料金を1件以上、正しい形式で指定してください" },
          { status: 400 }
        );
      }
      const part = partitionUnderBandsForCompetition(competition);
      if (!part) {
        return NextResponse.json({ message: "アンダー制が無効です" }, { status: 400 });
      }
      const underErr = validateUnderFeeTiersAgainstPartition(part, tiers);
      if (underErr) {
        return NextResponse.json({ message: underErr }, { status: 400 });
      }
      entryFeeData = { underFeeTiers: tiers };
    } else if (body.pricingMode === "byAge") {
      if (!Array.isArray(body.ageFeeTiers)) {
        return NextResponse.json(
          { message: "年齢帯別参加費の形式が正しくありません" },
          { status: 400 }
        );
      }
      const tiers = parseAgeFeeTiersFromBody(body.ageFeeTiers);
      if (!tiers) {
        return NextResponse.json(
          { message: "年齢帯を1件以上、正しい形式で指定してください" },
          { status: 400 }
        );
      }
      const overlap = validateAgeTiersNoOverlap(tiers);
      if (overlap) {
        return NextResponse.json({ message: overlap }, { status: 400 });
      }
      const coverErr = validateAgeFeeTiersCoverCompetitionRange(
        tiers,
        competition.minAge,
        competition.maxAge
      );
      if (coverErr) {
        return NextResponse.json({ message: coverErr }, { status: 400 });
      }
      entryFeeData = { ageFeeTiers: tiers };
    } else {
      const { individualEntryFee, teamEntryFeePerTeam } = body;

      if (typeof individualEntryFee !== "number" || individualEntryFee < 0) {
        return NextResponse.json(
          { message: "個人エントリー料金が正しくありません" },
          { status: 400 }
        );
      }

      if (
        typeof teamEntryFeePerTeam !== "number" ||
        teamEntryFeePerTeam < 0
      ) {
        return NextResponse.json(
          { message: "チーム種目の1チームあたり料金が正しくありません" },
          { status: 400 }
        );
      }

      entryFeeData = {
        individualEntryFee,
        teamEntryFeePerTeam,
      };
    }

    const updatedCompetition = await prisma.competition.update({
      where: { id: competitionId },
      data: {
        entryFee: entryFeeData,
      },
    });

    return NextResponse.json({
      message: "エントリー費用設定を更新しました",
      entryFee: updatedCompetition.entryFee,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/entry-fee/route.ts", error);
  }
}
