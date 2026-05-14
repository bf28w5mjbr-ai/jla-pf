export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireClubAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { assertOfficialQualificationFilterForUser } from "@/lib/officialApplicationSubmit";
import { syncTechnicalOfficialAssignmentFromOfficialApplication } from "@/lib/syncTechnicalOfficialAssignmentFromOfficialApplication";
import { computeClubDirectTechnicalOfficialAddMeta } from "@/lib/clubDirectTechnicalOfficialAddMeta";

type RouteContext = { params: Promise<{ clubId: string; competitionId: string }> };

type PostBody = {
  targetUserId?: string;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { clubId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as PostBody;
    const targetUserId =
      typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId が必要です" }, { status: 400 });
    }

    const meta = await computeClubDirectTechnicalOfficialAddMeta(prisma, {
      competitionId,
      clubId,
      viewerIsClubAdmin: true,
    });
    if (!meta.allowed) {
      return NextResponse.json(
        { error: meta.closedReason ?? "TOを追加できません" },
        { status: 400 }
      );
    }

    const [competition, club, targetUser] = await Promise.all([
      prisma.competition.findUnique({
        where: { id: competitionId },
        select: { officialQualificationFilterEnabled: true },
      }),
      prisma.club.findUnique({
        where: { id: clubId },
        select: { name: true },
      }),
      prisma.user.findFirst({
        where: { id: targetUserId, deletedAt: null },
        select: { id: true },
      }),
    ]);

    if (!competition || !club) {
      return NextResponse.json({ error: "大会またはクラブが見つかりません" }, { status: 404 });
    }
    if (!targetUser) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const qual = await assertOfficialQualificationFilterForUser(
      prisma,
      targetUserId,
      Boolean(competition.officialQualificationFilterEnabled)
    );
    if (!qual.ok) {
      return NextResponse.json({ error: qual.error }, { status: qual.status });
    }

    const positionName = `テクニカルオフィシャル（${club.name}）`;

    const existingAssignment = await prisma.competitionTechnicalOfficialAssignment.findUnique({
      where: {
        competitionId_clubId_userId: {
          competitionId,
          clubId,
          userId: targetUserId,
        },
      },
      select: { id: true },
    });
    if (existingAssignment) {
      return NextResponse.json({ error: "すでにこのクラブのテクニカルオフィシャルとして登録されています" }, { status: 409 });
    }

    const dupPending = await prisma.competitionTechnicalOfficialInvitation.findFirst({
      where: {
        competitionId,
        clubId,
        status: "PENDING",
        invitedUserId: targetUserId,
      },
      select: { id: true },
    });
    if (dupPending) {
      return NextResponse.json({ error: "このユーザーへの招待が保留中です。取り消してから追加してください。" }, { status: 409 });
    }

    const existingApp = await prisma.competitionOfficialApplication.findUnique({
      where: {
        competitionId_userId: { competitionId, userId: targetUserId },
      },
      select: { id: true, status: true },
    });

    const now = new Date();
    const adminNote = `クラブ管理者によるTO追加（操作者: ${session.userId}）`;

    const applicationRow = await prisma.$transaction(async (tx) => {
      const row = existingApp
        ? await tx.competitionOfficialApplication.update({
            where: { id: existingApp.id },
            data: {
              positionName,
              message: adminNote,
              status: "APPROVED",
              reviewedAt: now,
              reviewedByUserId: session.userId,
            },
          })
        : await tx.competitionOfficialApplication.create({
            data: {
              competitionId,
              userId: targetUserId,
              positionName,
              message: adminNote,
              status: "APPROVED",
              reviewedAt: now,
              reviewedByUserId: session.userId,
            },
          });

      await syncTechnicalOfficialAssignmentFromOfficialApplication(tx, {
        competitionId,
        userId: targetUserId,
        entryType: "TECHNICAL",
        clubId,
      });

      return row;
    });

    return NextResponse.json({ success: true, application: applicationRow });
  } catch (error) {
    return jsonInternalError500(
      "POST api/clubs/.../technical-official/direct-add",
      error
    );
  }
}
