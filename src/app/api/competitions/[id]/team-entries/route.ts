import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isClubAdminRole } from "@/lib/roleScopes";
import { buildTeamEntryPaymentOwnerId } from "@/lib/teamEntryPayments";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import {
  isTieredEntryFee,
  parseAgeCategoryFeeTiers,
  resolveEntryFeeUnits,
} from "@/lib/competitionEntryAgeTiered";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;

  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const { clubId, teams } = body ?? {};

    if (!clubId || typeof clubId !== "string") {
      return NextResponse.json({ message: "クラブを選択してください" }, { status: 400 });
    }

    if (!Array.isArray(teams)) {
      return NextResponse.json({ message: "チーム情報が不正です" }, { status: 400 });
    }

    const membership = await prisma.membership.findFirst({
      where: {
        clubId,
        userId: session.userId,
        status: "APPROVED",
      },
      select: {
        role: true,
      },
    });

    if (!membership || !isClubAdminRole(membership.role)) {
      return NextResponse.json(
        { message: "クラブ管理者のみがチームエントリーを更新できます" },
        { status: 403 }
      );
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        events: true,
        ageCategories: {
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            displayOrder: true,
            eligibleBirthDateFrom: true,
            eligibleBirthDateTo: true,
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    const now = new Date();
    const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
    const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
    const entryWindowOpen = entryStart && entryEnd ? now >= entryStart && now <= entryEnd : false;

    if (!entryWindowOpen) {
      return NextResponse.json(
        { message: "エントリー受付期間外のため更新できません" },
        { status: 403 }
      );
    }

    const eventMap = new Map(
      competition.events.filter((event) => event.type === "TEAM").map((event) => [event.id, event])
    );

    const normalizedTeams = teams.map((team: unknown) => {
      const item = team as { eventId?: string; teamName?: string };
      return {
        eventId: item.eventId ?? "",
        teamName: item.teamName?.trim() ?? "",
      };
    });

    if (normalizedTeams.some((team) => !team.eventId || !team.teamName)) {
      return NextResponse.json(
        { message: "種目とチーム名を入力してください" },
        { status: 400 }
      );
    }

    if (normalizedTeams.some((team) => !eventMap.has(team.eventId))) {
      return NextResponse.json(
        { message: "チーム種目以外は登録できません" },
        { status: 400 }
      );
    }

    const feeUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { dateOfBirth: true },
    });
    const userAge = feeUser?.dateOfBirth
      ? getCompetitionEligibilityAgeYears(
          new Date(feeUser.dateOfBirth),
          new Date(competition.startDate)
        )
      : null;
    const userDob = feeUser?.dateOfBirth ? new Date(feeUser.dateOfBirth) : null;
    const feeUnits = resolveEntryFeeUnits(competition.entryFee, userAge, {
      userDateOfBirth: userDob,
      competitionAgeCategories: competition.ageCategories,
    });
    if (
      feeUnits.ageTierMissing &&
      isTieredEntryFee(competition.entryFee) &&
      normalizedTeams.length > 0
    ) {
      const isCat = parseAgeCategoryFeeTiers(competition.entryFee) !== null;
      return NextResponse.json(
        {
          message: isCat
            ? feeUser?.dateOfBirth
              ? "参加費の年齢カテゴリに、あなたの生年月日が該当する区分がありません。主催者へお問い合わせください。"
              : "この大会は年齢カテゴリ別の参加費です。プロフィールに生年月日を登録してください。"
            : feeUser?.dateOfBirth
              ? "参加費の年齢帯に、あなたの年齢が含まれていません。主催者へお問い合わせください。"
              : "この大会は年齢帯別の参加費です。プロフィールに生年月日を登録してください。",
        },
        { status: 400 }
      );
    }

    const teamEntryFeePerTeam = feeUnits.teamUnit;

    await prisma.$transaction(async (tx) => {
      await tx.teamEntry.deleteMany({
        where: {
          competitionId,
          clubId,
        },
      });

      for (const team of normalizedTeams) {
        await tx.teamEntry.create({
          data: {
            competitionId,
            clubId,
            eventId: team.eventId,
            teamName: team.teamName,
          },
        });
      }

      const totalAmount = normalizedTeams.length * teamEntryFeePerTeam;
      const paymentOwnerId = buildTeamEntryPaymentOwnerId(competitionId, clubId);

      if (normalizedTeams.length === 0 || totalAmount <= 0) {
        await tx.payment.deleteMany({
          where: {
            ownerType: "CLUB",
            ownerId: paymentOwnerId,
            type: "COMPETITION_ENTRY_FEE",
          },
        });
      } else {
        await tx.payment.upsert({
          where: {
            ownerType_ownerId_type: {
              ownerType: "CLUB",
              ownerId: paymentOwnerId,
              type: "COMPETITION_ENTRY_FEE",
            },
          },
          create: {
            ownerType: "CLUB",
            ownerId: paymentOwnerId,
            type: "COMPETITION_ENTRY_FEE",
            userId: session.userId,
            status: "PENDING",
            amount: totalAmount,
            metadata: {
              scope: "TEAM_ENTRY",
              competitionId,
              clubId,
              teamCount: normalizedTeams.length,
              unitPrice: teamEntryFeePerTeam,
            },
          },
          update: {
            userId: session.userId,
            status: "PENDING",
            amount: totalAmount,
            metadata: {
              scope: "TEAM_ENTRY",
              competitionId,
              clubId,
              teamCount: normalizedTeams.length,
              unitPrice: teamEntryFeePerTeam,
            },
          },
        });
      }
    });

    const teamEntries = await prisma.teamEntry.findMany({
      where: {
        competitionId,
        clubId,
      },
      orderBy: [{ eventId: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        eventId: true,
        teamName: true,
      },
    });

    return NextResponse.json({
      message: "チームエントリーを更新しました",
      teamEntries,
      paymentOwnerId: buildTeamEntryPaymentOwnerId(competitionId, clubId),
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/team-entries/route.ts", error);
  }
}
