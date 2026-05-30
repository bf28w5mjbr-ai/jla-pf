import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isClubAdminRole } from "@/lib/roleScopes";
import {
  getTeamEntryMarshalAssignmentBlockedMap,
  getTeamMemberAssignmentWindowState,
} from "@/lib/teamMemberAssignmentWindow";
import {
  isClubMemberEligibleForTeamAssignmentSlot,
  prismaCompetitionToTeamAssignmentCompetitionJson,
  prismaEventToTeamAssignmentEventJson,
} from "@/lib/teamMemberSlotEligibility";

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
    const { clubId, assignments } = body ?? {};

    if (!clubId || typeof clubId !== "string") {
      return NextResponse.json({ message: "クラブを選択してください" }, { status: 400 });
    }

    if (!Array.isArray(assignments)) {
      return NextResponse.json({ message: "割当情報が不正です" }, { status: 400 });
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
        { message: "クラブ管理者のみがメンバー割当を更新できます" },
        { status: 403 }
      );
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        entryEndDate: true,
        startDate: true,
        startListSettings: true,
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
    const { open: isAssignmentWindowOpen } = await getTeamMemberAssignmentWindowState(
      prisma,
      competitionId,
      {
        entryEndDate: competition.entryEndDate,
        startListSettings: competition.startListSettings,
        startDate: competition.startDate,
      },
      now
    );

    if (!isAssignmentWindowOpen) {
      return NextResponse.json(
        { message: "エントリー終了後からメンバー割当が可能です" },
        { status: 403 }
      );
    }

    const normalizedAssignments = assignments.map((assignment: unknown) => {
      const item = assignment as {
        teamEntryId?: string;
        memberUserIds?: string[];
        memberSlots?: unknown;
      };
      const teamEntryId = item.teamEntryId ?? "";
      if (Array.isArray(item.memberSlots)) {
        const slots = item.memberSlots.map((cell) => {
          if (cell === null || cell === undefined || cell === "") return null;
          return typeof cell === "string" ? cell : null;
        });
        const used = new Set<string>();
        for (const uid of slots) {
          if (!uid) continue;
          if (used.has(uid)) {
            return { teamEntryId, memberSlots: null as null, error: "同じメンバーを複数の配属に入れることはできません" };
          }
          used.add(uid);
        }
        return { teamEntryId, memberSlots: slots, memberUserIds: [] as string[], error: null as string | null };
      }
      const memberUserIds = Array.isArray(item.memberUserIds)
        ? Array.from(new Set(item.memberUserIds.filter((id): id is string => typeof id === "string")))
        : [];
      return { teamEntryId, memberSlots: null as null, memberUserIds, error: null as string | null };
    });

    const slotError = normalizedAssignments.find((a) => a.error)?.error;
    if (slotError) {
      return NextResponse.json({ message: slotError }, { status: 400 });
    }

    if (normalizedAssignments.some((assignment) => !assignment.teamEntryId)) {
      return NextResponse.json({ message: "チーム情報が不正です" }, { status: 400 });
    }

    const teamEntries = await prisma.teamEntry.findMany({
      where: {
        competitionId,
        clubId,
        id: {
          in: normalizedAssignments.map((assignment) => assignment.teamEntryId),
        },
      },
      select: {
        id: true,
        eventId: true,
        event: {
          select: {
            sex: true,
            minAge: true,
            maxAge: true,
            eligibleBirthDateFrom: true,
            eligibleBirthDateTo: true,
            ageCategoryId: true,
          },
        },
      },
    });

    if (teamEntries.length !== normalizedAssignments.length) {
      return NextResponse.json(
        { message: "対象外のチームエントリーが含まれています" },
        { status: 400 }
      );
    }

    const marshalBlockMap = await getTeamEntryMarshalAssignmentBlockedMap(
      prisma,
      competitionId,
      teamEntries.map((t) => ({ id: t.id, eventId: t.eventId }))
    );
    const assignmentsToApply = normalizedAssignments.filter(
      (assignment) => !marshalBlockMap.get(assignment.teamEntryId)
    );
    if (assignmentsToApply.length === 0) {
      return NextResponse.json(
        {
          message:
            "スタートリスト上のチームが乗るヒートでマーシャル締切済みのため、該当チームのメンバー割当を変更できません",
        },
        { status: 403 }
      );
    }

    const eligibleEntries = await prisma.competitionEntry.findMany({
      where: {
        competitionId,
        clubId,
        status: "SUBMITTED",
      },
      select: {
        userId: true,
      },
    });
    const eligibleUserIds = new Set(eligibleEntries.map((entry) => entry.userId));

    const hasIneligibleUser = assignmentsToApply.some((assignment) => {
      if (assignment.memberSlots) {
        return assignment.memberSlots.some(
          (uid) => uid && !eligibleUserIds.has(uid)
        );
      }
      return (assignment.memberUserIds ?? []).some((userId) => !eligibleUserIds.has(userId));
    });
    if (hasIneligibleUser) {
      return NextResponse.json(
        { message: "クラブのエントリー済みメンバーのみ割り当てできます" },
        { status: 400 }
      );
    }

    const assignedUserIds = new Set<string>();
    for (const assignment of assignmentsToApply) {
      if (assignment.memberSlots) {
        for (const uid of assignment.memberSlots) {
          if (uid) assignedUserIds.add(uid);
        }
      } else {
        for (const uid of assignment.memberUserIds ?? []) {
          assignedUserIds.add(uid);
        }
      }
    }

    const assignedUsers =
      assignedUserIds.size > 0
        ? await prisma.user.findMany({
            where: { id: { in: [...assignedUserIds] } },
            select: { id: true, profile: { select: { sex: true, dateOfBirth: true } } },
          })
        : [];
    const userById = new Map(assignedUsers.map((u) => [u.id, u]));

    const competitionJson = prismaCompetitionToTeamAssignmentCompetitionJson({
      startDate: competition.startDate,
      ageCategories: competition.ageCategories,
    });

    const teamEntryById = new Map(teamEntries.map((t) => [t.id, t]));
    const eventEligibilityViolation = assignmentsToApply.some((assignment) => {
      const te = teamEntryById.get(assignment.teamEntryId);
      if (!te?.event) return true;
      const eventJson = prismaEventToTeamAssignmentEventJson(te.event);
      const slotList = assignment.memberSlots ?? assignment.memberUserIds ?? [];
      return slotList.some((userId) => {
        if (!userId) return false;
        const u = userById.get(userId);
        if (!u?.profile) return true;
        return !isClubMemberEligibleForTeamAssignmentSlot({
          memberSex: u.profile.sex,
          memberDateOfBirth: u.profile.dateOfBirth,
          event: eventJson,
          competition: competitionJson,
        });
      });
    });

    if (eventEligibilityViolation) {
      return NextResponse.json(
        {
          message:
            "種目の性別・年齢条件を満たさないメンバーが含まれています。該当ポジションのメンバーを選び直してください。",
        },
        { status: 400 }
      );
    }

    const memberRows = assignmentsToApply.flatMap((assignment) => {
      if (assignment.memberSlots) {
        return assignment.memberSlots
          .map((userId, index) =>
            userId
              ? {
                  teamEntryId: assignment.teamEntryId,
                  userId,
                  role: "ATHLETE" as const,
                  order: index + 1,
                }
              : null
          )
          .filter((row): row is NonNullable<typeof row> => row !== null);
      }

      const legacyIds = assignment.memberUserIds ?? [];
      return legacyIds.map((userId, index) => ({
        teamEntryId: assignment.teamEntryId,
        userId,
        role: "ATHLETE" as const,
        order: index + 1,
      }));
    });

    /**
     * 既定 ~5s のインタラクティブ TX タイムアウトを超えると
     * 「Transaction not found … old closed transaction」になる（特に多数チームの逐次 create）。
     */
    await prisma.$transaction(
      async (tx) => {
        await tx.teamEntryMember.deleteMany({
          where: {
            teamEntryId: {
              in: assignmentsToApply.map((assignment) => assignment.teamEntryId),
            },
          },
        });

        if (memberRows.length > 0) {
          await tx.teamEntryMember.createMany({ data: memberRows });
        }
      },
      { maxWait: 20_000, timeout: 55_000 }
    );

    return NextResponse.json({
      message: "チームメンバー割当を更新しました",
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/team-assignments/route.ts", error);
  }
}
