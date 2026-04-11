import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { isOrgAdminRole } from "@/lib/roleScopes";
import { parseEligibleBirthDateInput } from "@/lib/eligibleBirthDateInput";

type RouteContext = { params: Promise<{ id: string }> };

async function requireCompetitionAdmin(competitionId: string, userId: string) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      organization: {
        include: {
          admins: { where: { userId } },
        },
      },
    },
  });
  if (!competition) return { ok: false as const, status: 404 as const, message: "大会が見つかりません" };
  const isAdmin = competition.organization.admins.some(
    (a) => a.userId === userId && isOrgAdminRole(a.role)
  );
  if (!isAdmin) return { ok: false as const, status: 403 as const, message: "権限がありません" };
  return { ok: true as const, competition };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const rows = await prisma.competitionAgeCategory.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });
    return NextResponse.json({ ageCategories: rows });
  } catch (error) {
    return jsonInternalError500("GET api/competitions/[id]/age-categories/route.ts", error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const gate = await requireCompetitionAdmin(competitionId, session.userId);
    if (!gate.ok) {
      return NextResponse.json({ message: gate.message }, { status: gate.status });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      displayOrder?: unknown;
      eligibleBirthDateFrom?: unknown;
      eligibleBirthDateTo?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ message: "カテゴリ名を入力してください" }, { status: 400 });
    }

    let fromD: Date | null;
    let toD: Date | null;
    if (body.eligibleBirthDateFrom === undefined && body.eligibleBirthDateTo === undefined) {
      fromD = null;
      toD = null;
    } else {
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
    }
    if (fromD && toD && fromD.getTime() > toD.getTime()) {
      return NextResponse.json(
        { message: "生年月日の開始は終了以前の日付にしてください" },
        { status: 400 }
      );
    }

    const maxOrder = await prisma.competitionAgeCategory.aggregate({
      where: { competitionId },
      _max: { displayOrder: true },
    });
    const nextOrder =
      typeof body.displayOrder === "number" && Number.isInteger(body.displayOrder)
        ? body.displayOrder
        : (maxOrder._max.displayOrder ?? -1) + 1;

    const created = await prisma.competitionAgeCategory.create({
      data: {
        competitionId,
        name,
        displayOrder: nextOrder,
        eligibleBirthDateFrom: fromD,
        eligibleBirthDateTo: toD,
      },
    });

    const ageCategories = await prisma.competitionAgeCategory.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({ ageCategory: created, ageCategories });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/age-categories/route.ts", error);
  }
}
