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
import { isOrgAdminRole } from "@/lib/roleScopes";

type RouteContext = { params: Promise<{ id: string }> };

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

    const body = (await request.json().catch(() => ({}))) as {
      requiredQualifications?: unknown;
      announcementMessage?: unknown;
    };
    const { requiredQualifications, announcementMessage } = body;

    if (!Array.isArray(requiredQualifications)) {
      return NextResponse.json(
        { message: "必要資格の形式が正しくありません" },
        { status: 400 }
      );
    }

    const allowedQualifications = [
      "選手登録",
      "BLS・WS",
      "認定ライフセーバー",
    ];

    const normalizedQualifications = requiredQualifications
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);

    const uniqueQualifications = Array.from(new Set(normalizedQualifications));

    const hasInvalid = uniqueQualifications.some(
      (item) => !allowedQualifications.includes(item)
    );

    if (hasInvalid) {
      return NextResponse.json(
        { message: "必要資格は選手登録・BLS・WS・認定ライフセーバーのみ設定できます" },
        { status: 400 }
      );
    }

    const mutationState = await loadCompetitionMutationState(competitionId);
    const announce =
      typeof announcementMessage === "string" ? announcementMessage.trim() : undefined;
    try {
      assertRequiredQualificationsChange(
        competition,
        uniqueQualifications,
        mutationState,
        announce
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
        requiredQualifications: uniqueQualifications,
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
