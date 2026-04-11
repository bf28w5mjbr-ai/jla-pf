import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isOrgAdminRole } from "@/lib/roleScopes";
import { buildTeamEntryPaymentOwnerId } from "@/lib/teamEntryPayments";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import { resolveEntryFeeUnits } from "@/lib/competitionEntryAgeTiered";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

    const finalizedAt = now.toISOString();
    const targetClubIds = Array.from(teamCounts.keys());

    if (targetClubIds.length === 0) {
      return NextResponse.json({
        message: "確定対象のチーム請求がありません",
        finalizedCount: 0,
      });
    }

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
      const defaultTeamUnit = resolveEntryFeeUnits(competition.entryFee, userAge, {
        userDateOfBirth: userDob,
        competitionAgeCategories: competition.ageCategories,
      }).teamUnit;

      for (const targetClubId of targetClubIds) {
        const teamCount = teamCounts.get(targetClubId) ?? 0;
        const ownerId = buildTeamEntryPaymentOwnerId(competitionId, targetClubId);

        const existingPayment = await tx.payment.findUnique({
          where: {
            ownerType_ownerId_type: {
              ownerType: "CLUB",
              ownerId,
              type: "COMPETITION_ENTRY_FEE",
            },
          },
          select: {
            id: true,
            status: true,
            metadata: true,
          },
        });

        let teamEntryFeePerTeam = defaultTeamUnit;
        const meta = existingPayment?.metadata;
        if (meta && typeof meta === "object" && !Array.isArray(meta)) {
          const m = meta as Record<string, unknown>;
          if (typeof m.unitPrice === "number" && Number.isFinite(m.unitPrice) && m.unitPrice >= 0) {
            teamEntryFeePerTeam = m.unitPrice;
          }
        }

        const amount = teamCount * teamEntryFeePerTeam;

        if (amount <= 0) {
          await tx.payment.deleteMany({
            where: {
              ownerType: "CLUB",
              ownerId,
              type: "COMPETITION_ENTRY_FEE",
            },
          });
          continue;
        }
        const nextStatus =
          existingPayment?.status === "SUCCEEDED" ||
          existingPayment?.status === "REFUNDED" ||
          existingPayment?.status === "DISPUTED"
            ? existingPayment.status
            : "PENDING";

        await tx.payment.upsert({
          where: {
            ownerType_ownerId_type: {
              ownerType: "CLUB",
              ownerId,
              type: "COMPETITION_ENTRY_FEE",
            },
          },
          create: {
            ownerType: "CLUB",
            ownerId,
            type: "COMPETITION_ENTRY_FEE",
            userId: session.userId,
            status: nextStatus,
            amount,
            metadata: {
              scope: "TEAM_ENTRY",
              competitionId,
              clubId: targetClubId,
              teamCount,
              unitPrice: teamEntryFeePerTeam,
              finalizedAt,
              finalizedByUserId: session.userId,
            },
          },
          update: {
            userId: session.userId,
            status: nextStatus,
            amount,
            metadata: {
              scope: "TEAM_ENTRY",
              competitionId,
              clubId: targetClubId,
              teamCount,
              unitPrice: teamEntryFeePerTeam,
              finalizedAt,
              finalizedByUserId: session.userId,
            },
          },
        });
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
