import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  buildOfficialApplicationSubmitPayload,
  loadOfficialApplicationCompetition,
  parseOfficialApplicationBody,
  shouldBlockDisabledTechnicalOfficialDowngrade,
} from "@/lib/officialApplicationSubmit";
import {
  clearTechnicalOfficialAssignmentsFromOfficialApplicationWithdraw,
  syncTechnicalOfficialAssignmentFromOfficialApplication,
} from "@/lib/syncTechnicalOfficialAssignmentFromOfficialApplication";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証です" }, { status: 401 });
    }

    const loaded = await loadOfficialApplicationCompetition(prisma, competitionId, session.userId);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }
    const { competition } = loaded;

    const body = (await req.json().catch(() => null)) as unknown;
    const { message, entryType, clubId } = parseOfficialApplicationBody(body);

    const payload = await buildOfficialApplicationSubmitPayload(prisma, {
      competitionId,
      sessionUserId: session.userId,
      competition,
      entryType,
      clubId,
      message,
    });
    if (!payload.ok) {
      return NextResponse.json({ error: payload.error }, { status: payload.status });
    }
    const { positionName } = payload;

    const existing = await prisma.competitionOfficialApplication.findUnique({
      where: {
        competitionId_userId: { competitionId, userId: session.userId },
      },
    });

    if (existing?.status === "PENDING" || existing?.status === "APPROVED") {
      return NextResponse.json(
        { error: "すでに応募済みです。内容を変更する場合は応募内容の更新を利用してください。" },
        { status: 409 }
      );
    }

    const now = new Date();
    const data = {
      positionName,
      message: payload.message,
      status: "APPROVED" as const,
      reviewedAt: now,
      reviewedByUserId: null,
    };

    const row = await prisma.$transaction(async (tx) => {
      const applicationRow =
        existing?.status === "REJECTED"
          ? await tx.competitionOfficialApplication.update({
              where: { id: existing.id },
              data,
            })
          : await tx.competitionOfficialApplication.create({
              data: {
                competitionId,
                userId: session.userId,
                positionName,
                message: payload.message,
                status: "APPROVED",
                reviewedAt: now,
                reviewedByUserId: null,
              },
            });

      await syncTechnicalOfficialAssignmentFromOfficialApplication(tx, {
        competitionId,
        userId: session.userId,
        entryType,
        clubId,
      });

      return applicationRow;
    });

    return NextResponse.json({ success: true, application: row });
  } catch (e) {
    return jsonInternalError500("POST api/competitions/[id]/official-applications/route.ts", e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証です" }, { status: 401 });
    }

    const loaded = await loadOfficialApplicationCompetition(prisma, competitionId, session.userId);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }
    const { competition } = loaded;

    const existing = await prisma.competitionOfficialApplication.findUnique({
      where: {
        competitionId_userId: { competitionId, userId: session.userId },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "応募が見つかりません" }, { status: 404 });
    }
    if (existing.status !== "APPROVED" && existing.status !== "PENDING") {
      return NextResponse.json(
        { error: "受付済みの応募のみ内容を変更できます" },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => null)) as unknown;
    const { message, entryType, clubId } = parseOfficialApplicationBody(body);

    if (
      shouldBlockDisabledTechnicalOfficialDowngrade({
        existingPositionName: existing.positionName,
        nextEntryType: entryType,
        technicalOfficialRecruitmentEnabled: competition.technicalOfficialRecruitmentEnabled,
      })
    ) {
      return NextResponse.json(
        {
          error:
            "TO募集が停止中のため、TO応募を一般応募へ変更できません。取り消す場合は応募の取り消しを利用してください。",
        },
        { status: 400 }
      );
    }

    const payload = await buildOfficialApplicationSubmitPayload(prisma, {
      competitionId,
      sessionUserId: session.userId,
      competition,
      entryType,
      clubId,
      message,
    });
    if (!payload.ok) {
      return NextResponse.json({ error: payload.error }, { status: payload.status });
    }

    const row = await prisma.$transaction(async (tx) => {
      const applicationRow = await tx.competitionOfficialApplication.update({
        where: { id: existing.id },
        data: {
          positionName: payload.positionName,
          message: payload.message,
          status: "APPROVED",
        },
      });

      await syncTechnicalOfficialAssignmentFromOfficialApplication(tx, {
        competitionId,
        userId: session.userId,
        entryType,
        clubId,
      });

      return applicationRow;
    });

    return NextResponse.json({ success: true, application: row });
  } catch (e) {
    return jsonInternalError500("PATCH api/competitions/[id]/official-applications/route.ts", e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証です" }, { status: 401 });
    }

    const loaded = await loadOfficialApplicationCompetition(prisma, competitionId, session.userId);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }

    const existing = await prisma.competitionOfficialApplication.findUnique({
      where: {
        competitionId_userId: { competitionId, userId: session.userId },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "応募が見つかりません" }, { status: 404 });
    }
    if (existing.status !== "APPROVED" && existing.status !== "PENDING") {
      return NextResponse.json(
        { error: "取り消せる応募がありません（見送り済みの応募は取り消し不要です）" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await clearTechnicalOfficialAssignmentsFromOfficialApplicationWithdraw(tx, {
        competitionId,
        userId: session.userId,
      });
      await tx.competitionOfficialApplication.delete({
        where: { id: existing.id },
      });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return jsonInternalError500("DELETE api/competitions/[id]/official-applications/route.ts", e);
  }
}
