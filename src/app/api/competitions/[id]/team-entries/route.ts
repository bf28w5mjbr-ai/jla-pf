import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ENTRY_CHECKOUT_PAID_STATUSES } from "@/lib/entryCheckoutSessionPaid";
import { reconcileRetroactiveClubPrepaidSlotsAfterTeamEntrySave } from "@/lib/clubPrepaidIndividualSlotRetroactiveReconcile";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isClubAdminRole } from "@/lib/roleScopes";
import {
  buildClubPrepaidIndividualPaymentOwnerId,
  buildTeamEntryPaymentOwnerId,
  CLUB_PREPAID_INDIVIDUAL_BILLING_SCOPE,
  TEAM_ENTRY_PAYMENT_MUTABLE_STATUSES,
  isMutableTeamEntryPaymentStatus,
  isTerminalTeamEntryPaymentStatus,
  TEAM_ENTRY_BILLING_SCOPE,
} from "@/lib/teamEntryPayments";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import {
  isTieredEntryFee,
  maxTeamEntryFeeUnitAcrossTiers,
  resolveEntryFeeUnits,
} from "@/lib/competitionEntryAgeTiered";
import { resolveClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import {
  replaceClubPrepaidSlotsForSave,
  sumInstantPrepaidIndividualsYen,
} from "@/lib/clubPrepaidIndividualSlots";
import { clubTeamNameBaseFromClub, shouldStripLetterSuffixForSingleTeam } from "@/lib/teamEntryClubBaseName";
import {
  countTeamEntriesByEventForClub,
  eventIdsWithTeamCountChange,
  syncStartListSnapshotBeforeMarshal,
} from "@/lib/startListSnapshotOnEntryIncrease";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Prisma Int 用。NaN/Infinity を弾き、異常設定で 500 にならないようにする */
function toSafeNonNegativeIntYen(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 2_147_000_000);
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((item) => bs.has(item));
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

    const clubRow = await prisma.club.findUnique({
      where: { id: clubId },
      select: { abbreviation: true, name: true },
    });
    if (!clubRow) {
      return NextResponse.json({ message: "クラブが見つかりません" }, { status: 404 });
    }
    const clubTeamBase = clubTeamNameBaseFromClub(clubRow);
    const teamsToPersist = normalizedTeams.map((team) => {
      if (
        (incomingTeamCountByEvent.get(team.eventId) ?? 0) === 1 &&
        shouldStripLetterSuffixForSingleTeam(clubRow, team.teamName)
      ) {
        return { ...team, teamName: clubTeamBase };
      }
      return team;
    });

    const feeUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { profile: { select: { dateOfBirth: true } } },
    });
    const userDateOfBirth = feeUser?.profile?.dateOfBirth ?? null;
    const userAge = userDateOfBirth
      ? getCompetitionEligibilityAgeYears(
          new Date(userDateOfBirth),
          new Date(competition.startDate)
        )
      : null;
    const userDob = userDateOfBirth ? new Date(userDateOfBirth) : null;
    const feeUnits = resolveEntryFeeUnits(competition.entryFee, userAge, {
      userDateOfBirth: userDob,
      competitionAgeCategories: competition.ageCategories,
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

      const prepaidAlreadyPaid = await prisma.competitionEntry.findFirst({
        where: {
          competitionId,
          clubId,
          userId: { in: prepaidIndividualUserIds },
          status: "SUBMITTED",
          checkoutSessions: {
            some: { status: { in: [...ENTRY_CHECKOUT_PAID_STATUSES] } },
          },
        },
        select: { userId: true },
      });
      if (prepaidAlreadyPaid) {
        return NextResponse.json(
          {
            message:
              "個人のカード決済が済んでいる選手はクラブ個人枠に含められません。該当ユーザーをリストから除外してください（返金が必要な場合は運営へお問い合わせください）。",
          },
          { status: 400 }
        );
      }
    }

    const clubIndividualBillingTiming = resolveClubIndividualEntryBillingTiming(competition.entryFee);

    const teamPaymentOwnerId = buildTeamEntryPaymentOwnerId(competitionId, clubId);
    const prepaidPaymentOwnerId = buildClubPrepaidIndividualPaymentOwnerId(competitionId, clubId);
    const [existingTeamPayment, existingPrepaidPayment] = await Promise.all([
      prisma.payment.findUnique({
        where: {
          ownerType_ownerId_type: {
            ownerType: "CLUB",
            ownerId: teamPaymentOwnerId,
            type: "COMPETITION_ENTRY_FEE",
          },
        },
        select: { id: true, status: true },
      }),
      prisma.payment.findUnique({
        where: {
          ownerType_ownerId_type: {
            ownerType: "CLUB",
            ownerId: prepaidPaymentOwnerId,
            type: "COMPETITION_ENTRY_FEE",
          },
        },
        select: { id: true, status: true },
      }),
    ]);
    const terminalPrepaidPayment = isTerminalTeamEntryPaymentStatus(existingPrepaidPayment?.status);

    if (terminalPrepaidPayment) {
      const currentPrepaidSlots = await prisma.clubCompetitionPrepaidIndividualSlot.findMany({
        where: {
          competitionId,
          clubId,
          status: {
            in: ["PENDING_CLUB_CHECKOUT", "ACTIVE_WAIVER", "DEFERRED_POST_CLOSE"],
          },
          consumedByEntryId: null,
        },
        select: { coveredUserId: true },
      });
      const currentPrepaidIds = [
        ...new Set(currentPrepaidSlots.map((slot) => slot.coveredUserId).filter(Boolean)),
      ].sort();
      const requestedPrepaidIds = [...prepaidIndividualUserIds].sort();
      if (!sameStringSet(currentPrepaidIds, requestedPrepaidIds)) {
        return NextResponse.json(
          {
            message:
              "支払い済みのクラブ個人枠はこの画面から変更できません。返金や差分請求が必要な場合は主催者へお問い合わせください。",
          },
          { status: 409 }
        );
      }
    }

    const teamCountsBeforeSave = await countTeamEntriesByEventForClub({
      competitionId,
      clubId,
    });

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

      if (teamsToPersist.length > 0) {
        await tx.teamEntry.createMany({
          data: teamsToPersist.map((team) => ({
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
        ageCategories: competition.ageCategories,
        coveredUserIds: prepaidIndividualUserIds,
      });

      const prepaidSub = toSafeNonNegativeIntYen(prepaidSubtotalYenRaw);
      const teamTotalYen = toSafeNonNegativeIntYen(teamsToPersist.length * teamEntryFeePerTeam);
      const hasPrepaidUsers = prepaidIndividualUserIds.length > 0;
      const instantPrepaidWithAmount =
        hasPrepaidUsers &&
        clubIndividualBillingTiming === "INSTANT_PREPAID" &&
        prepaidSub > 0;

      const deleteBothClubEntryFeePayments = async () => {
        await tx.payment.deleteMany({
          where: {
            ownerType: "CLUB",
            type: "COMPETITION_ENTRY_FEE",
            ownerId: { in: [teamPaymentOwnerId, prepaidPaymentOwnerId] },
            status: { in: [...TEAM_ENTRY_PAYMENT_MUTABLE_STATUSES] },
          },
        });
      };

      if (
        teamsToPersist.length === 0 &&
        hasPrepaidUsers &&
        clubIndividualBillingTiming === "POST_CLOSE_INVOICE"
      ) {
        await deleteBothClubEntryFeePayments();
        if (!terminalPrepaidPayment) {
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
        }
      } else if (teamsToPersist.length === 0 && !hasPrepaidUsers) {
        await deleteBothClubEntryFeePayments();
        if (!terminalPrepaidPayment) {
          await tx.clubCompetitionPrepaidIndividualSlot.deleteMany({
            where: { competitionId, clubId },
          });
        }
      } else if (teamTotalYen + prepaidSub <= 0 && !hasPrepaidUsers) {
        await deleteBothClubEntryFeePayments();
        if (!terminalPrepaidPayment) {
          await tx.clubCompetitionPrepaidIndividualSlot.deleteMany({
            where: { competitionId, clubId },
          });
        }
      } else {
        if (teamTotalYen > 0) {
          const teamPaymentData = {
            userId: session.userId,
            status: "PENDING" as const,
            amount: teamTotalYen,
            metadata: {
              scope: TEAM_ENTRY_BILLING_SCOPE,
              competitionId,
              clubId,
              teamCount: teamsToPersist.length,
              unitPrice: teamEntryFeePerTeam,
              prepaidIndividualSubtotalYen: 0,
              clubIndividualBillingTiming,
            },
          };
          if (!existingTeamPayment) {
            await tx.payment.create({
              data: {
                ownerType: "CLUB",
                ownerId: teamPaymentOwnerId,
                type: "COMPETITION_ENTRY_FEE",
                ...teamPaymentData,
              },
            });
          } else if (isMutableTeamEntryPaymentStatus(existingTeamPayment.status)) {
            await tx.payment.updateMany({
              where: {
                id: existingTeamPayment.id,
                status: { in: [...TEAM_ENTRY_PAYMENT_MUTABLE_STATUSES] },
              },
              data: teamPaymentData,
            });
          }
        } else {
          await tx.payment.deleteMany({
            where: {
              ownerType: "CLUB",
              ownerId: teamPaymentOwnerId,
              type: "COMPETITION_ENTRY_FEE",
              status: { in: [...TEAM_ENTRY_PAYMENT_MUTABLE_STATUSES] },
            },
          });
        }

        let prepaidPaymentIdForSlots: string | null = null;
        if (terminalPrepaidPayment) {
          prepaidPaymentIdForSlots = existingPrepaidPayment?.id ?? null;
        } else if (instantPrepaidWithAmount) {
          const prepaidPaymentData = {
            userId: session.userId,
            status: "PENDING" as const,
            amount: prepaidSub,
            metadata: {
              scope: CLUB_PREPAID_INDIVIDUAL_BILLING_SCOPE,
              competitionId,
              clubId,
              teamCount: teamsToPersist.length,
              unitPrice: teamEntryFeePerTeam,
              prepaidIndividualSubtotalYen: prepaidSub,
              clubIndividualBillingTiming,
            },
          };
          if (!existingPrepaidPayment) {
            const prepaidRow = await tx.payment.create({
              data: {
                ownerType: "CLUB",
                ownerId: prepaidPaymentOwnerId,
                type: "COMPETITION_ENTRY_FEE",
                ...prepaidPaymentData,
              },
            });
            prepaidPaymentIdForSlots = prepaidRow.id;
          } else if (isMutableTeamEntryPaymentStatus(existingPrepaidPayment.status)) {
            await tx.payment.updateMany({
              where: {
                id: existingPrepaidPayment.id,
                status: { in: [...TEAM_ENTRY_PAYMENT_MUTABLE_STATUSES] },
              },
              data: prepaidPaymentData,
            });
            prepaidPaymentIdForSlots = existingPrepaidPayment.id;
          }
        } else {
          await tx.payment.deleteMany({
            where: {
              ownerType: "CLUB",
              ownerId: prepaidPaymentOwnerId,
              type: "COMPETITION_ENTRY_FEE",
              status: { in: [...TEAM_ENTRY_PAYMENT_MUTABLE_STATUSES] },
            },
          });
        }

        if (hasPrepaidUsers) {
          if (!terminalPrepaidPayment) {
            await replaceClubPrepaidSlotsForSave(tx, {
              competitionId,
              clubId,
              prepaidIndividualUserIds,
              billingTiming: clubIndividualBillingTiming,
              paymentId: prepaidPaymentIdForSlots ?? undefined,
            });
          }
        } else {
          if (!terminalPrepaidPayment) {
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
      }
    },
      { maxWait: 20_000, timeout: 55_000 }
    );

    if (prepaidIndividualUserIds.length > 0) {
      await reconcileRetroactiveClubPrepaidSlotsAfterTeamEntrySave(prisma, {
        competitionId,
        clubId,
        coveredUserIds: prepaidIndividualUserIds,
      });
    }

    const teamCountsAfterSave = await countTeamEntriesByEventForClub({
      competitionId,
      clubId,
    });
    const changedTeamEventIds = eventIdsWithTeamCountChange(
      teamCountsBeforeSave,
      teamCountsAfterSave
    );
    if (changedTeamEventIds.length > 0) {
      await syncStartListSnapshotBeforeMarshal({
        competitionId,
        candidateEventIds: changedTeamEventIds,
        createdByUserId: session.userId,
        trigger: "TEAM_ENTRIES_SAVE",
        request,
      });
    }

    const teamEntries = await prisma.teamEntry.findMany({
      where: {
        competitionId,
        clubId,
      },
      orderBy: [
        { event: { category: "asc" } },
        { event: { ageCategory: { displayOrder: "asc" } } },
        { event: { displayOrder: "asc" } },
        { teamName: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        eventId: true,
        teamName: true,
      },
    });

    return NextResponse.json({
      message: "チームエントリーを更新しました",
      teamEntries,
      paymentOwnerId: teamPaymentOwnerId,
      prepaidPaymentOwnerId: prepaidPaymentOwnerId,
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
