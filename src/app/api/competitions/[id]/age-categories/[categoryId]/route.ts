import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import {
  assertEventAgePatchAllowed,
  CompetitionEditForbiddenError,
  loadCompetitionMutationState,
} from "@/lib/competitionPublishedEditRules";
import { isOrgAdminRole } from "@/lib/roleScopes";
import { parseEligibleBirthDateInput } from "@/lib/eligibleBirthDateInput";
import { eventBirthFieldsFromAgeCategory } from "@/lib/competitionAgeCategorySync";

type RouteContext = { params: Promise<{ id: string; categoryId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId, categoryId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const row = await prisma.competitionAgeCategory.findFirst({
      where: { id: categoryId, competitionId },
      include: {
        competition: {
          include: {
            organization: {
              include: { admins: { where: { userId: session.userId } } },
            },
          },
        },
      },
    });

    if (!row) {
      return NextResponse.json({ message: "年齢カテゴリが見つかりません" }, { status: 404 });
    }

    const isAdmin = row.competition.organization.admins.some(
      (a) => a.userId === session.userId && isOrgAdminRole(a.role)
    );
    if (!isAdmin) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      displayOrder?: unknown;
      eligibleBirthDateFrom?: unknown;
      eligibleBirthDateTo?: unknown;
    };

    const touchedBirthFrom = Object.prototype.hasOwnProperty.call(body, "eligibleBirthDateFrom");
    const touchedBirthTo = Object.prototype.hasOwnProperty.call(body, "eligibleBirthDateTo");
    if (touchedBirthFrom !== touchedBirthTo) {
      return NextResponse.json(
        { message: "生年月日範囲を更新するときは eligibleBirthDateFrom と eligibleBirthDateTo の両方を送ってください" },
        { status: 400 }
      );
    }
    const datesPatching = touchedBirthFrom && touchedBirthTo;

    let fromD: Date | null = null;
    let toD: Date | null = null;
    if (datesPatching) {
      const mutationState = await loadCompetitionMutationState(competitionId);
      try {
        assertEventAgePatchAllowed(mutationState);
      } catch (e) {
        if (e instanceof CompetitionEditForbiddenError) {
          return NextResponse.json({ message: e.message }, { status: 400 });
        }
        throw e;
      }
      try {
        fromD = parseEligibleBirthDateInput(body.eligibleBirthDateFrom);
        toD = parseEligibleBirthDateInput(body.eligibleBirthDateTo);
      } catch {
        return NextResponse.json(
          { message: "生年月日の範囲は YYYY-MM-DD または null（両方セット）で指定してください" },
          { status: 400 }
        );
      }
      const hasFrom = body.eligibleBirthDateFrom !== undefined && body.eligibleBirthDateFrom !== "";
      const hasTo = body.eligibleBirthDateTo !== undefined && body.eligibleBirthDateTo !== "";
      if (hasFrom !== hasTo) {
        return NextResponse.json(
          { message: "生年月日の開始・終了は両方指定するか、両方 null にしてください" },
          { status: 400 }
        );
      }
      if (fromD && toD && fromD.getTime() > toD.getTime()) {
        return NextResponse.json(
          { message: "生年月日の開始は終了以前の日付にしてください" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.competitionAgeCategory.update({
        where: { id: categoryId },
        data: {
          ...(typeof body.name === "string" && body.name.trim()
            ? { name: body.name.trim() }
            : {}),
          ...(typeof body.displayOrder === "number" && Number.isInteger(body.displayOrder)
            ? { displayOrder: body.displayOrder }
            : {}),
          ...(datesPatching ? { eligibleBirthDateFrom: fromD, eligibleBirthDateTo: toD } : {}),
        },
      });

      if (datesPatching) {
        const birth = eventBirthFieldsFromAgeCategory({
          eligibleBirthDateFrom: fromD,
          eligibleBirthDateTo: toD,
        });
        await tx.event.updateMany({
          where: { ageCategoryId: categoryId },
          data: {
            ...birth,
          },
        });
      }

      return next;
    });

    const ageCategories = await prisma.competitionAgeCategory.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({ ageCategory: updated, ageCategories });
  } catch (error) {
    return jsonInternalError500(
      "PATCH api/competitions/[id]/age-categories/[categoryId]/route.ts",
      error
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId, categoryId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const row = await prisma.competitionAgeCategory.findFirst({
      where: { id: categoryId, competitionId },
      include: {
        competition: {
          include: {
            organization: {
              include: { admins: { where: { userId: session.userId } } },
            },
          },
        },
      },
    });

    if (!row) {
      return NextResponse.json({ message: "年齢カテゴリが見つかりません" }, { status: 404 });
    }

    const isAdmin = row.competition.organization.admins.some(
      (a) => a.userId === session.userId && isOrgAdminRole(a.role)
    );
    if (!isAdmin) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    const linked = await prisma.event.count({ where: { ageCategoryId: categoryId } });
    if (linked > 0) {
      return NextResponse.json(
        { message: `このカテゴリを使用中の種目が${linked}件あるため削除できません。種目の割当を外してください。` },
        { status: 400 }
      );
    }

    await prisma.competitionAgeCategory.delete({ where: { id: categoryId } });

    const ageCategories = await prisma.competitionAgeCategory.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({ ok: true, ageCategories });
  } catch (error) {
    return jsonInternalError500(
      "DELETE api/competitions/[id]/age-categories/[categoryId]/route.ts",
      error
    );
  }
}
