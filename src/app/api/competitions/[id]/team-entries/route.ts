import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isClubAdminRole } from "@/lib/roleScopes";
import { buildTeamEntryPaymentOwnerId } from "@/lib/teamEntryPayments";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import {
  isTieredEntryFee,
  maxTeamEntryFeeUnitAcrossTiers,
  resolveEntryFeeUnits,
} from "@/lib/competitionEntryAgeTiered";
import { partitionUnderBandsForCompetition } from "@/lib/competitionUnderAgeSettings";
import { resolveClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import {
  replaceClubPrepaidSlotsForSave,
  sumInstantPrepaidIndividualsYen,
} from "@/lib/clubPrepaidIndividualSlots";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Prisma Int 用。NaN/Infinity を弾き、異常設定で 500 にならないようにする */
function toSafeNonNegativeIntYen(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 2_147_000_000);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;

  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      body =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
    } catch {
      return NextResponse.json({ message: "リクエストの形式が不正です" }, { status: 400 });
    }
    const { clubId, teams, prepaidIndividualUserIds: rawPrepaidIds } = body;

    if (!clubId || typeof clubId !== "string") {
      return NextResponse.json({ message: "クラブを選択してください" }, { status: 400 });
    }

    if (!Array.isArray(teams)) {
      return NextResponse.json({ message: "チーム情報が不正です" }, { status: 400 });
    }

    const prepaidIndividualUserIds = Array.isArray(rawPrepaidIds)
      ? [
          ...new Set(
            rawPrepaidIds
              .filter((x: unknown): x is string => typeof x === "string")
              .map((id) => id.trim())
              .filter(Boolean)
          ),
        ]
      : [];

    if (prepaidIndividualUserIds.length > 200) {
      return NextResponse.json(
        { message: "クラブによる個人エントリーの人数が多すぎます" },
        { status: 400 }
      );
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

    /** 本番でマイグレーション先行／遅延があっても、未反映の列を SELECT しないよう必要列のみ */
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        entryStartDate: true,
        entryEndDate: true,
        startDate: true,
        entryFee: true,
        underAgeSystemEnabled: true,
        underAgeUThresholds: true,
        underAgeOpenEnabled: true,
        ageCategories: {
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            displayOrder: true,
            eligibleBirthDateFrom: true,
            eligibleBirthDateTo: true,
          },
        },
        events: {
          where: { type: "TEAM" },
          select: {
            id: true,
            type: true,
            name: true,
            maxTeamEntriesPerClub: true,
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

    const eventMap = new Map(competition.events.map((event) => [event.id, event]));

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

    const incomingTeamCountByEvent = new Map<string, number>();
    for (const team of normalizedTeams) {
      incomingTeamCountByEvent.set(
        team.eventId,
        (incomingTeamCountByEvent.get(team.eventId) ?? 0) + 1
      );
    }
    for (const [eventId, count] of incomingTeamCountByEvent) {
      const ev = eventMap.get(eventId);
      const cap = ev?.maxTeamEntriesPerClub ?? null;
      if (cap != null && count > cap) {
        return NextResponse.json(
          {
            message: `「${ev?.name ?? "種目"}」は同一クラブあたりチームエントリーは最大${cap}組までです。`,
          },
          { status: 400 }
        );
      }
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
    const underPartition = partitionUnderBandsForCompetition(competition);
    const userDob = feeUser?.dateOfBirth ? new Date(feeUser.dateOfBirth) : null;
    const feeUnits = resolveEntryFeeUnits(competition.entryFee, userAge, {
      userDateOfBirth: userDob,
      competitionAgeCategories: competition.ageCategories,
      underFeePartition: underPartition ?? null,
    });
    let teamEntryFeePerTeam = feeUnits.teamUnit;
    if (
      feeUnits.ageTierMissing &&
      isTieredEntryFee(competition.entryFee) &&
      normalizedTeams.length > 0
    ) {
      const fallbackTeamUnit = maxTeamEntryFeeUnitAcrossTiers(competition.entryFee);
      if (fallbackTeamUnit == null) {
        return NextResponse.json(
          { message: "参加費のチーム単価を解決できません。主催者へお問い合わせください。" },
          { status: 400 }
        );
      }
      teamEntryFeePerTeam = fallbackTeamUnit;
    }
    teamEntryFeePerTeam = toSafeNonNegativeIntYen(teamEntryFeePerTeam);

    if (prepaidIndividualUserIds.length > 0) {
      const memberRows = await prisma.membership.findMany({
        where: {
          clubId,
          userId: { in: prepaidIndividualUserIds },
          status: "APPROVED",
        },
        select: { userId: true },
      });
      if (memberRows.length !== prepaidIndividualUserIds.length) {
        return NextResponse.json(
          { message: "クラブによる個人エントリーには、このクラブの承認済みメンバーのみ指定できます" },
          { status: 400 }
        );
      }
    }

    const clubIndividualBillingTiming = resolveClubIndividualEntryBillingTiming(competition.entryFee);

    const paymentOwnerId = buildTeamEntryPaymentOwnerId(competitionId, clubId);
    const existingTeamPayment = await prisma.payment.findUnique({
      where: {
        ownerType_ownerId_type: {
          ownerType: "CLUB",
          ownerId: paymentOwnerId,
          type: "COMPETITION_ENTRY_FEE",
        },
      },
      select: { status: true },
    });
    const clearStripeRefsAfterSucceededPayment = existingTeamPayment?.status === "SUCCEEDED";

    /**
     * 既定 ~5s のインタラクティブ TX タイムアウトを超えると
     * 「Transaction not found … old closed transaction」になる（特に多数チームの逐次 create）。
     */
    await prisma.$transaction(
      async (tx) => {
      /**
       * TeamEntry 削除は CompetitionParticipantStatus へ ON DELETE SET NULL。
       * 同一種目・同一 marshalRound で複数チーム分の行が、null 化後に
       * @@unique([competitionId, eventId, participantType, competitionEntryId, teamEntryId, teamMemberUserId, marshalRound])
       * で衝突し得る（例: teamMemberUserId が null のチーム単位行が複数）。
       * エントリー期間中のクラブ側チーム一覧の置き換えでは、当該チームに紐づく marshal 行を先に除去する。
       * ID 明示の deleteMany にする（リレーション絞り込みの生成 SQL 差異を避ける）。
       */
      const doomedTeamEntryIds = await tx.teamEntry.findMany({
        where: { competitionId, clubId },
        select: { id: true },
      });
      const doomedIds = doomedTeamEntryIds.map((r) => r.id);
      if (doomedIds.length > 0) {
        await tx.competitionParticipantStatus.deleteMany({
          where: { teamEntryId: { in: doomedIds } },
        });
      }

      await tx.teamEntry.deleteMany({
        where: {
          competitionId,
          clubId,
        },
      });

      if (normalizedTeams.length > 0) {
        await tx.teamEntry.createMany({
          data: normalizedTeams.map((team) => ({
            competitionId,
            clubId,
            eventId: team.eventId,
            teamName: team.teamName,
          })),
        });
      }

      const prepaidSubtotalYenRaw = await sumInstantPrepaidIndividualsYen(tx, {
        startDate: new Date(competition.startDate),
        entryFee: competition.entryFee,
        underAge: {
          underAgeSystemEnabled: competition.underAgeSystemEnabled,
          underAgeUThresholds: competition.underAgeUThresholds,
          underAgeOpenEnabled: competition.underAgeOpenEnabled,
        },
        ageCategories: competition.ageCategories,
        coveredUserIds: prepaidIndividualUserIds,
      });

      const prepaidSub = toSafeNonNegativeIntYen(prepaidSubtotalYenRaw);
      const teamTotalYen = toSafeNonNegativeIntYen(normalizedTeams.length * teamEntryFeePerTeam);
      const totalAmount = toSafeNonNegativeIntYen(teamTotalYen + prepaidSub);

      if (
        normalizedTeams.length === 0 &&
        prepaidIndividualUserIds.length > 0 &&
        clubIndividualBillingTiming === "POST_CLOSE_INVOICE"
      ) {
        await tx.payment.deleteMany({
          where: {
            ownerType: "CLUB",
            ownerId: paymentOwnerId,
            type: "COMPETITION_ENTRY_FEE",
          },
        });
        await tx.clubCompetitionPrepaidIndividualSlot.deleteMany({
          where: {
            competitionId,
            clubId,
            status: {
              in: ["PENDING_CLUB_CHECKOUT", "ACTIVE_WAIVER", "DEFERRED_POST_CLOSE"],
            },
            consumedByEntryId: null,
          },
        });
        await replaceClubPrepaidSlotsForSave(tx, {
          competitionId,
          clubId,
          prepaidIndividualUserIds,
          billingTiming: clubIndividualBillingTiming,
        });
      } else if (normalizedTeams.length === 0 && prepaidIndividualUserIds.length === 0) {
        await tx.payment.deleteMany({
          where: {
            ownerType: "CLUB",
            ownerId: paymentOwnerId,
            type: "COMPETITION_ENTRY_FEE",
          },
        });
        await tx.clubCompetitionPrepaidIndividualSlot.deleteMany({
          where: { competitionId, clubId },
        });
      } else if (totalAmount <= 0 && prepaidIndividualUserIds.length === 0) {
        await tx.payment.deleteMany({
          where: {
            ownerType: "CLUB",
            ownerId: paymentOwnerId,
            type: "COMPETITION_ENTRY_FEE",
          },
        });
        await tx.clubCompetitionPrepaidIndividualSlot.deleteMany({
          where: { competitionId, clubId },
        });
      } else {
        const payment = await tx.payment.upsert({
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
              prepaidIndividualSubtotalYen: prepaidSub,
              clubIndividualBillingTiming,
            },
          },
          update: {
            userId: session.userId,
            status: "PENDING",
            amount: totalAmount,
            ...(clearStripeRefsAfterSucceededPayment
              ? {
                  stripeCheckoutSessionId: null,
                  stripePaymentIntentId: null,
                  paidAt: null,
                }
              : {}),
            metadata: {
              scope: "TEAM_ENTRY",
              competitionId,
              clubId,
              teamCount: normalizedTeams.length,
              unitPrice: teamEntryFeePerTeam,
              prepaidIndividualSubtotalYen: prepaidSub,
              clubIndividualBillingTiming,
            },
          },
        });

        if (prepaidIndividualUserIds.length > 0) {
          await replaceClubPrepaidSlotsForSave(tx, {
            competitionId,
            clubId,
            prepaidIndividualUserIds,
            billingTiming: clubIndividualBillingTiming,
            paymentId: payment.id,
          });
        } else {
          await tx.clubCompetitionPrepaidIndividualSlot.deleteMany({
            where: {
              competitionId,
              clubId,
              status: {
                in: ["PENDING_CLUB_CHECKOUT", "ACTIVE_WAIVER", "DEFERRED_POST_CLOSE"],
              },
              consumedByEntryId: null,
            },
          });
        }
      }
    },
      { maxWait: 20_000, timeout: 55_000 }
    );

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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        {
          message:
            "データの一意制約に抵触しました。別端末での更新や当日運用記録との競合の可能性があります。運営へお問い合わせください。",
        },
        { status: 409 }
      );
    }
    return jsonInternalError500("PUT api/competitions/[id]/team-entries/route.ts", error);
  }
}
