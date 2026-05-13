import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  announceCompetitionRuleChange,
  assertRequiredQualificationsChange,
  CompetitionEditForbiddenError,
  loadCompetitionMutationState,
} from "@/lib/competitionPublishedEditRules";
import {
  deriveEntryQualificationOptionsFromTemplates,
  normalizeAgeCategoryQualificationTiersInput,
  normalizeEntryRequiredQualifications,
  validateAgeCategoryQualificationTiersAgainstCategories,
  validateAgeQualificationTiersCoverCompetitionRange,
  validateAgeTiersNoOverlap,
  type AgeCategoryQualificationTier,
  type AgeQualificationTier,
} from "@/lib/competitionEntryAgeTiered";
import { isOrgAdminRole } from "@/lib/roleScopes";

type RouteContext = { params: Promise<{ id: string }> };

function normalizeTierList(
  items: unknown[],
  allowedQualifications: ReadonlySet<string>
): AgeQualificationTier[] {
  const out: AgeQualificationTier[] = [];
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
    if (!Number.isFinite(minAge) || minAge < 0) continue;
    if (maxAge !== null && (!Number.isFinite(maxAge) || maxAge < minAge)) continue;
    const qualsRaw = t.requiredQualifications;
    if (!Array.isArray(qualsRaw)) continue;
    const requiredQualifications = normalizeEntryRequiredQualifications(qualsRaw, {
      allowedQualifications,
      expandCertifiedLifesaverMacro: true,
    });
    out.push({ minAge, maxAge, requiredQualifications });
  }
  return out;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;

    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

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

    const isAdmin = competition.organization.admins.some(
      (admin) =>
        admin.userId === session.userId && isOrgAdminRole(admin.role)
    );

    if (!isAdmin) {
      return NextResponse.json(
        { message: "この操作を実行する権限がありません" },
        { status: 403 }
      );
    }

    const qualificationTemplates = await prisma.qualificationTemplate.findMany({
      orderBy: [{ name: "asc" }, { kind: "asc" }],
      select: { id: true, name: true, kind: true },
    });
    const allowedQualificationSet = new Set(
      deriveEntryQualificationOptionsFromTemplates(qualificationTemplates)
    );

    const body = (await request.json().catch(() => ({}))) as {
      requiredQualifications?: unknown;
      ageQualificationTiers?: unknown;
      ageCategoryQualificationTiers?: unknown;
      announcementMessage?: unknown;
    };
    const {
      requiredQualifications,
      ageQualificationTiers,
      ageCategoryQualificationTiers,
      announcementMessage,
    } = body;

    let stored: unknown;

    if (ageCategoryQualificationTiers !== undefined) {
      if (!Array.isArray(ageCategoryQualificationTiers)) {
        return NextResponse.json(
          { message: "AGEカテゴリ別の資格の形式が正しくありません" },
          { status: 400 }
        );
      }
      const tiers = normalizeAgeCategoryQualificationTiersInput(
        ageCategoryQualificationTiers,
        allowedQualificationSet
      );
      if (!tiers?.length) {
        return NextResponse.json(
          { message: "AGEカテゴリを1件以上、正しい形式で指定してください" },
          { status: 400 }
        );
      }
      const categories = await prisma.competitionAgeCategory.findMany({
        where: { competitionId },
        orderBy: { displayOrder: "asc" },
        select: { id: true },
      });
      if (categories.length === 0) {
        return NextResponse.json(
          {
            message:
              "AGEカテゴリがまだありません。大会出場条件カードの「AGEカテゴリ」で先にカテゴリを作成してください。",
          },
          { status: 400 }
        );
      }
      const categoryIdSet = new Set(categories.map((c) => c.id));
      const validationError = validateAgeCategoryQualificationTiersAgainstCategories(
        tiers,
        categoryIdSet
      );
      if (validationError) {
        return NextResponse.json({ message: validationError }, { status: 400 });
      }
      const normalized: AgeCategoryQualificationTier[] = tiers.map((tier) => ({
        ageCategoryId: tier.ageCategoryId,
        requiredQualifications: normalizeEntryRequiredQualifications(tier.requiredQualifications, {
          allowedQualifications: allowedQualificationSet,
          expandCertifiedLifesaverMacro: true,
        }),
      }));
      stored = { ageCategoryQualificationTiers: normalized };
    } else if (ageQualificationTiers !== undefined) {
      if (!Array.isArray(ageQualificationTiers)) {
        return NextResponse.json(
          { message: "年齢帯別の資格の形式が正しくありません" },
          { status: 400 }
        );
      }
      const tiers = normalizeTierList(ageQualificationTiers, allowedQualificationSet);
      if (tiers.length === 0) {
        return NextResponse.json(
          { message: "年齢帯を1件以上指定してください" },
          { status: 400 }
        );
      }
      const overlap = validateAgeTiersNoOverlap(tiers);
      if (overlap) {
        return NextResponse.json({ message: overlap }, { status: 400 });
      }
      const coverErr = validateAgeQualificationTiersCoverCompetitionRange(
        tiers,
        competition.minAge,
        competition.maxAge
      );
      if (coverErr) {
        return NextResponse.json({ message: coverErr }, { status: 400 });
      }
      stored = { ageQualificationTiers: tiers };
    } else {
      if (!Array.isArray(requiredQualifications)) {
        return NextResponse.json(
          { message: "必要資格の形式が正しくありません" },
          { status: 400 }
        );
      }

      const normalizedQualifications = requiredQualifications
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0);
      const uniqueQualifications = normalizeEntryRequiredQualifications(
        normalizedQualifications,
        {
          allowedQualifications: allowedQualificationSet,
          expandCertifiedLifesaverMacro: true,
        }
      );

      const hasInvalid = normalizedQualifications.some(
        (item) => !allowedQualificationSet.has(item)
      );

      if (hasInvalid) {
        return NextResponse.json(
          { message: "必要資格は資格テンプレートに登録された項目のみ設定できます" },
          { status: 400 }
        );
      }

      stored = uniqueQualifications;
    }

    const mutationState = await loadCompetitionMutationState(competitionId);
    const announce =
      typeof announcementMessage === "string" ? announcementMessage.trim() : undefined;
    try {
      assertRequiredQualificationsChange(competition, stored, mutationState, announce);
    } catch (e) {
      if (e instanceof CompetitionEditForbiddenError) {
        return NextResponse.json({ message: e.message }, { status: 400 });
      }
      throw e;
    }

    const updated = await prisma.competition.update({
      where: { id: competitionId },
      data: {
        requiredQualifications: stored as object | string[],
      },
    });

    if (
      announce &&
      mutationState.isPublished &&
      mutationState.hasEstablishedEntry
    ) {
      await announceCompetitionRuleChange({
        competitionId,
        title: `${competition.name} の参加資格条件が更新されました`,
        body: announce,
      });
    }

    return NextResponse.json({
      requiredQualifications: updated.requiredQualifications ?? [],
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/entry-qualifications/route.ts", error);
  }
}
