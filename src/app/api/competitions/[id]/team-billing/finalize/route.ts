import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isOrgAdminRole } from "@/lib/roleScopes";
import {
  buildClubPrepaidIndividualPaymentOwnerId,
  buildTeamEntryPaymentOwnerId,
  CLUB_PREPAID_INDIVIDUAL_BILLING_SCOPE,
  TEAM_ENTRY_BILLING_SCOPE,
} from "@/lib/teamEntryPayments";
import { sumInstantPrepaidIndividualsYen } from "@/lib/clubPrepaidIndividualSlots";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import { resolveEntryFeeUnits } from "@/lib/competitionEntryAgeTiered";
import { partitionUnderBandsForCompetition } from "@/lib/competitionUnderAgeSettings";
import { resolveClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import { sumDeferredUnpaidIndividualEntryFeesYen } from "@/lib/clubPrepaidIndividualSlots";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function toSafeNonNegativeIntYen(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 2_147_000_000);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;

  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        ageCategories: {
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            displayOrder: true,
            eligibleBirthDateFrom: true,
            eligibleBirthDateTo: true,
          },
        },
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
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    const isAdmin = competition.organization.admins.some((admin) =>
      isOrgAdminRole(admin.role)
    );
    if (!isAdmin) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    const now = new Date();
    const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
    if (!entryEnd || now <= entryEnd) {
      return NextResponse.json(
        { message: "エントリー締切後に請求を確定してください" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const clubId = typeof body.clubId === "string" ? body.clubId : null;

    const teamEntries = await prisma.teamEntry.findMany({
      where: {
        competitionId,
        ...(clubId ? { clubId } : {}),
      },
      select: {
        clubId: true,
      },
    });

    const teamCounts = new Map<string, number>();
    teamEntries.forEach((entry) => {
      teamCounts.set(entry.clubId, (teamCounts.get(entry.clubId) ?? 0) + 1);
    });

    const deferredClubRows = await prisma.clubCompetitionPrepaidIndividualSlot.findMany({
      where: {
        competitionId,
        status: "DEFERRED_POST_CLOSE",
        ...(clubId ? { clubId } : {}),
      },
      select: { clubId: true },
      distinct: ["clubId"],
    });
    const deferredClubIds = deferredClubRows.map((r) => r.clubId);
    const targetClubIds = Array.from(
      new Set<string>([...teamCounts.keys(), ...deferredClubIds])
    );

    const finalizedAt = now.toISOString();

    if (targetClubIds.length === 0) {
      return NextResponse.json({
        message: "確定対象のチーム請求がありません",
        finalizedCount: 0,
      });
    }

    const clubIndividualBillingTiming = resolveClubIndividualEntryBillingTiming(
      competition.entryFee
    );

    await prisma.$transaction(async (tx) => {
      const feeUser = await tx.user.findUnique({
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
      const underPartition = partitionUnderBandsForCompetition(competition);
      const defaultTeamUnit = resolveEntryFeeUnits(competition.entryFee, userAge, {
        userDateOfBirth: userDob,
        competitionAgeCategories: competition.ageCategories,
        underFeePartition: underPartition ?? null,
      }).teamUnit;

      for (const targetClubId of targetClubIds) {
        const teamOwnerId = buildTeamEntryPaymentOwnerId(competitionId, targetClubId);
        const prepaidOwnerId = buildClubPrepaidIndividualPaymentOwnerId(competitionId, targetClubId);

        const [existingTeamPayment, existingPrepaidPayment] = await Promise.all([
          tx.payment.findUnique({
            where: {
              ownerType_ownerId_type: {
                ownerType: "CLUB",
                ownerId: teamOwnerId,
                type: "COMPETITION_ENTRY_FEE",
              },
            },
            select: { id: true, status: true, metadata: true },
          }),
          tx.payment.findUnique({
            where: {
              ownerType_ownerId_type: {
                ownerType: "CLUB",
                ownerId: prepaidOwnerId,
                type: "COMPETITION_ENTRY_FEE",
              },
            },
            select: { id: true, status: true, metadata: true },
          }),
        ]);

        let teamEntryFeePerTeam = defaultTeamUnit;
        const teamMeta = existingTeamPayment?.metadata;
        if (teamMeta && typeof teamMeta === "object" && !Array.isArray(teamMeta)) {
          const m = teamMeta as Record<string, unknown>;
          if (typeof m.unitPrice === "number" && Number.isFinite(m.unitPrice) && m.unitPrice >= 0) {
            teamEntryFeePerTeam = m.unitPrice;
          }
        }

        const teamCount = teamCounts.get(targetClubId) ?? 0;
        const teamPart = toSafeNonNegativeIntYen(teamCount * teamEntryFeePerTeam);
        const deferredIndividualSubtotalYen = await sumDeferredUnpaidIndividualEntryFeesYen(tx, {
          competitionId,
          clubId: targetClubId,
        });

        const slotRows = await tx.clubCompetitionPrepaidIndividualSlot.findMany({
          where: {
            competitionId,
            clubId: targetClubId,
            status: {
              in: ["PENDING_CLUB_CHECKOUT", "ACTIVE_WAIVER", "DEFERRED_POST_CLOSE"],
            },
            consumedByEntryId: null,
          },
          select: { coveredUserId: true },
        });
        const coveredUserIds = [...new Set(slotRows.map((r) => r.coveredUserId))];

        const instantPrepaidPartRaw =
          clubIndividualBillingTiming === "INSTANT_PREPAID"
            ? await sumInstantPrepaidIndividualsYen(tx, {
                startDate: new Date(competition.startDate),
                entryFee: competition.entryFee,
                underAge: {
                  underAgeSystemEnabled: competition.underAgeSystemEnabled,
                  underAgeUThresholds: competition.underAgeUThresholds,
                  underAgeOpenEnabled: competition.underAgeOpenEnabled,
                },
                ageCategories: competition.ageCategories,
                coveredUserIds,
              })
            : 0;
        const instantPrepaidPart = toSafeNonNegativeIntYen(instantPrepaidPartRaw);

        const prepaidPart =
          clubIndividualBillingTiming === "POST_CLOSE_INVOICE"
            ? toSafeNonNegativeIntYen(deferredIndividualSubtotalYen)
            : instantPrepaidPart;

        if (teamPart <= 0 && prepaidPart <= 0) {
          await tx.payment.deleteMany({
            where: {
              ownerType: "CLUB",
              type: "COMPETITION_ENTRY_FEE",
              ownerId: { in: [teamOwnerId, prepaidOwnerId] },
            },
          });
          continue;
        }

        const teamNextStatus =
          existingTeamPayment?.status === "SUCCEEDED" ||
          existingTeamPayment?.status === "REFUNDED" ||
          existingTeamPayment?.status === "DISPUTED"
            ? existingTeamPayment.status
            : "PENDING";

        const prepaidNextStatus =
          existingPrepaidPayment?.status === "SUCCEEDED" ||
          existingPrepaidPayment?.status === "REFUNDED" ||
          existingPrepaidPayment?.status === "DISPUTED"
            ? existingPrepaidPayment.status
            : "PENDING";

        if (teamPart > 0) {
          await tx.payment.upsert({
            where: {
              ownerType_ownerId_type: {
                ownerType: "CLUB",
                ownerId: teamOwnerId,
                type: "COMPETITION_ENTRY_FEE",
              },
            },
            create: {
              ownerType: "CLUB",
              ownerId: teamOwnerId,
              type: "COMPETITION_ENTRY_FEE",
              userId: session.userId,
              status: teamNextStatus,
              amount: teamPart,
              metadata: {
                scope: TEAM_ENTRY_BILLING_SCOPE,
                competitionId,
                clubId: targetClubId,
                teamCount,
                unitPrice: teamEntryFeePerTeam,
                deferredIndividualSubtotalYen,
                prepaidIndividualSubtotalYen: 0,
                clubIndividualBillingTiming,
                finalizedAt,
                finalizedByUserId: session.userId,
              },
            },
            update: {
              userId: session.userId,
              status: teamNextStatus,
              amount: teamPart,
              metadata: {
                scope: TEAM_ENTRY_BILLING_SCOPE,
                competitionId,
                clubId: targetClubId,
                teamCount,
                unitPrice: teamEntryFeePerTeam,
                deferredIndividualSubtotalYen,
                prepaidIndividualSubtotalYen: 0,
                clubIndividualBillingTiming,
                finalizedAt,
                finalizedByUserId: session.userId,
              },
            },
          });
        } else {
          await tx.payment.deleteMany({
            where: {
              ownerType: "CLUB",
              ownerId: teamOwnerId,
              type: "COMPETITION_ENTRY_FEE",
            },
          });
        }

        if (prepaidPart > 0) {
          await tx.payment.upsert({
            where: {
              ownerType_ownerId_type: {
                ownerType: "CLUB",
                ownerId: prepaidOwnerId,
                type: "COMPETITION_ENTRY_FEE",
              },
            },
            create: {
              ownerType: "CLUB",
              ownerId: prepaidOwnerId,
              type: "COMPETITION_ENTRY_FEE",
              userId: session.userId,
              status: prepaidNextStatus,
              amount: prepaidPart,
              metadata: {
                scope: CLUB_PREPAID_INDIVIDUAL_BILLING_SCOPE,
                competitionId,
                clubId: targetClubId,
                teamCount,
                unitPrice: teamEntryFeePerTeam,
                prepaidIndividualSubtotalYen: prepaidPart,
                deferredIndividualSubtotalYen:
                  clubIndividualBillingTiming === "POST_CLOSE_INVOICE"
                    ? deferredIndividualSubtotalYen
                    : 0,
                clubIndividualBillingTiming,
                finalizedAt,
                finalizedByUserId: session.userId,
              },
            },
            update: {
              userId: session.userId,
              status: prepaidNextStatus,
              amount: prepaidPart,
              metadata: {
                scope: CLUB_PREPAID_INDIVIDUAL_BILLING_SCOPE,
                competitionId,
                clubId: targetClubId,
                teamCount,
                unitPrice: teamEntryFeePerTeam,
                prepaidIndividualSubtotalYen: prepaidPart,
                deferredIndividualSubtotalYen:
                  clubIndividualBillingTiming === "POST_CLOSE_INVOICE"
                    ? deferredIndividualSubtotalYen
                    : 0,
                clubIndividualBillingTiming,
                finalizedAt,
                finalizedByUserId: session.userId,
              },
            },
          });
        } else {
          await tx.payment.deleteMany({
            where: {
              ownerType: "CLUB",
              ownerId: prepaidOwnerId,
              type: "COMPETITION_ENTRY_FEE",
            },
          });
        }
      }
    });

    return NextResponse.json({
      message: clubId ? "クラブ請求を確定しました" : "チーム請求を確定しました",
      finalizedCount: targetClubIds.length,
      finalizedAt,
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/team-billing/finalize/route.ts", error);
  }
}
