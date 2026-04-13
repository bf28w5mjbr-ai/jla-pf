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

type RouteContext = { params: Promise<{ id: string }> };

function normalizeThresholds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const xs = raw
    .map((x) => (typeof x === "number" ? Math.floor(x) : NaN))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 150);
  return Array.from(new Set(xs)).sort((a, b) => a - b);
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
    };

    const underAgeSystemEnabled = body.underAgeSystemEnabled === true;
    const underAgeUThresholds = normalizeThresholds(body.underAgeUThresholds);
    const underAgeOpenEnabled = body.underAgeOpenEnabled !== false;

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

    return NextResponse.json({
      message: "アンダー制の設定を更新しました",
      underAgeSystemEnabled: updated.underAgeSystemEnabled,
      underAgeUThresholds: updated.underAgeUThresholds,
      underAgeOpenEnabled: updated.underAgeOpenEnabled,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/under-age-settings/route.ts", error);
  }
}
