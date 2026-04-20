import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  buildOfficialApplicationSubmitPayload,
  loadOfficialApplicationCompetition,
  parseOfficialApplicationBody,
} from "@/lib/officialApplicationSubmit";

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

    if (existing?.status === "PENDING") {
      return NextResponse.json(
        { error: "すでに応募済みです（審査中）" },
        { status: 409 }
      );
    }
    if (existing?.status === "APPROVED") {
      return NextResponse.json({ error: "すでに承認済みです" }, { status: 409 });
    }

    const data = {
      positionName,
      message: payload.message,
      status: "PENDING" as const,
      reviewedAt: null,
      reviewedByUserId: null,
    };

    const row =
      existing?.status === "REJECTED"
        ? await prisma.competitionOfficialApplication.update({
            where: { id: existing.id },
            data,
          })
        : await prisma.competitionOfficialApplication.create({
            data: {
              competitionId,
              userId: session.userId,
              positionName,
              message: payload.message,
            },
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
    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: "審査中の応募のみ内容を変更できます" },
        { status: 400 }
      );
    }

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

    const row = await prisma.competitionOfficialApplication.update({
      where: { id: existing.id },
      data: {
        positionName: payload.positionName,
        message: payload.message,
        reviewedAt: null,
        reviewedByUserId: null,
      },
    });

    return NextResponse.json({ success: true, application: row });
  } catch (e) {
    return jsonInternalError500("PATCH api/competitions/[id]/official-applications/route.ts", e);
  }
}
