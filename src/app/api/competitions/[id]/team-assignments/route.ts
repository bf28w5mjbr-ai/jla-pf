import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isClubAdminRole } from "@/lib/roleScopes";
import {
  getTeamEntryMarshalAssignmentBlockedMap,
  getTeamMemberAssignmentWindowState,
} from "@/lib/teamMemberAssignmentWindow";

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
    const marshalBlocked = normalizedAssignments.some((a) => marshalBlockMap.get(a.teamEntryId));
    if (marshalBlocked) {
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

    const hasIneligibleUser = normalizedAssignments.some((assignment) => {
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

    await prisma.$transaction(async (tx) => {
      await tx.teamEntryMember.deleteMany({
        where: {
          teamEntryId: {
            in: normalizedAssignments.map((assignment) => assignment.teamEntryId),
          },
        },
      });

      for (const assignment of normalizedAssignments) {
        if (assignment.memberSlots) {
          const rows = assignment.memberSlots
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
          if (rows.length === 0) continue;
          await tx.teamEntryMember.createMany({ data: rows });
          continue;
        }

        const legacyIds = assignment.memberUserIds ?? [];
        if (legacyIds.length === 0) continue;

        await tx.teamEntryMember.createMany({
          data: legacyIds.map((userId, index) => ({
            teamEntryId: assignment.teamEntryId,
            userId,
            role: "ATHLETE",
            order: index + 1,
          })),
        });
      }
    });

    return NextResponse.json({
      message: "チームメンバー割当を更新しました",
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/team-assignments/route.ts", error);
  }
}
