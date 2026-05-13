import { jsonInternalError500 } from "@/lib/apiInternalError";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import {
  assertEntryFeeEditable,
  CompetitionEditForbiddenError,
  assertEventDeletionAllowed,
  loadCompetitionMutationState,
} from "@/lib/competitionPublishedEditRules";
import { isOrgAdminRole } from "@/lib/roleScopes";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Body = {
  sourceCompetitionId?: string;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: targetCompetitionId } = await context.params;

  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const body = (await request.json()) as Body;
    const sourceCompetitionId = body.sourceCompetitionId?.trim();
    if (!sourceCompetitionId) {
      return NextResponse.json({ message: "コピー元の大会IDが必要です" }, { status: 400 });
    }
    if (sourceCompetitionId === targetCompetitionId) {
      return NextResponse.json({ message: "同じ大会をコピー元にできません" }, { status: 400 });
    }

    const [target, source] = await Promise.all([
      prisma.competition.findUnique({
        where: { id: targetCompetitionId },
        include: {
          organization: {
            include: {
              admins: { where: { userId: session.userId } },
            },
          },
        },
      }),
      prisma.competition.findUnique({
        where: { id: sourceCompetitionId },
        include: {
          organization: {
            include: {
              admins: { where: { userId: session.userId } },
            },
          },
          ageCategories: { orderBy: { displayOrder: "asc" } },
          events: { orderBy: { displayOrder: "asc" } },
        },
      }),
    ]);

    if (!target || !source) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    if (target.organizationId !== source.organizationId) {
      return NextResponse.json(
        { message: "同一主催団体内の大会だけコピーできます" },
        { status: 403 }
      );
    }

    const adminOk = (o: typeof target.organization) =>
      o.admins.some((a) => a.userId === session.userId && isOrgAdminRole(a.role));

    if (!adminOk(target.organization) || !adminOk(source.organization)) {
      return NextResponse.json({ message: "この操作を実行する権限がありません" }, { status: 403 });
    }

    const [entryCount, teamEntryCount] = await Promise.all([
      prisma.competitionEntry.count({ where: { competitionId: targetCompetitionId } }),
      prisma.teamEntry.count({ where: { competitionId: targetCompetitionId } }),
    ]);

    if (entryCount > 0 || teamEntryCount > 0) {
      return NextResponse.json(
        {
          message:
            "エントリーが1件でもある大会には、種目・参加費・年齢カテゴリ・アンダー制・出場資格などの設定をコピーできません",
        },
        { status: 400 }
      );
    }

    const mutationState = await loadCompetitionMutationState(targetCompetitionId);
    try {
      assertEventDeletionAllowed(mutationState);
      assertEntryFeeEditable(mutationState);
    } catch (e) {
      if (e instanceof CompetitionEditForbiddenError) {
        return NextResponse.json({ message: e.message }, { status: 400 });
      }
      throw e;
    }

    await prisma.$transaction(async (tx) => {
      await tx.event.deleteMany({ where: { competitionId: targetCompetitionId } });
      await tx.competitionAgeCategory.deleteMany({
        where: { competitionId: targetCompetitionId },
      });

      const ageCategoryIdMap = new Map<string, string>();
      for (const cat of source.ageCategories) {
        const created = await tx.competitionAgeCategory.create({
          data: {
            competitionId: targetCompetitionId,
            name: cat.name,
            displayOrder: cat.displayOrder,
            eligibleBirthDateFrom: cat.eligibleBirthDateFrom,
            eligibleBirthDateTo: cat.eligibleBirthDateTo,
          },
        });
        ageCategoryIdMap.set(cat.id, created.id);
      }

      for (const ev of source.events) {
        const mappedAgeCategoryId =
          ev.ageCategoryId != null ? ageCategoryIdMap.get(ev.ageCategoryId) ?? null : null;
        await tx.event.create({
          data: {
            competitionId: targetCompetitionId,
            ageCategoryId: mappedAgeCategoryId,
            name: ev.name,
            sex: ev.sex,
            type: ev.type,
            category: ev.category,
            requiresEntryTime: ev.requiresEntryTime,
            displayOrder: ev.displayOrder,
            minAge: ev.minAge,
            maxAge: ev.maxAge,
            eligibleBirthDateFrom: ev.eligibleBirthDateFrom,
            eligibleBirthDateTo: ev.eligibleBirthDateTo,
            scheduledStartAt: ev.scheduledStartAt,
            scheduledEndAt: ev.scheduledEndAt,
            preliminaryHeatLaneCount: ev.preliminaryHeatLaneCount,
            startListRoundCount: ev.startListRoundCount,
            startListHeatPlanConfirmedAt: null,
            marshalStartedAt: null,
            teamRelayPositionCount: ev.teamRelayPositionCount,
            teamRelayPositionNames:
              ev.teamRelayPositionNames == null
                ? undefined
                : (ev.teamRelayPositionNames as Prisma.InputJsonValue),
            maxTeamEntriesPerClub: ev.maxTeamEntriesPerClub ?? null,
          },
        });
      }

      await tx.competition.update({
        where: { id: targetCompetitionId },
        data: {
          entryFee:
            source.entryFee == null
              ? Prisma.JsonNull
              : (source.entryFee as Prisma.InputJsonValue),
          underAgeSystemEnabled: source.underAgeSystemEnabled ?? false,
          underAgeUThresholds: source.underAgeUThresholds ?? [],
          underAgeOpenEnabled: source.underAgeOpenEnabled ?? true,
          requiredQualifications:
            source.requiredQualifications == null
              ? Prisma.JsonNull
              : (source.requiredQualifications as Prisma.InputJsonValue),
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/copy-entry-settings-from/route.ts", error);
  }
}
