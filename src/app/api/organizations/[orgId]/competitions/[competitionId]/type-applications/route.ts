export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";

type PostBody = {
  requestedType?: unknown;
};

const allowedTypes = new Set(["A", "B"]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgId: string; competitionId: string }> }
) {
  try {
    const { orgId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(orgId, session.userId, "operational");
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const competition = await prisma.competition.findFirst({
      where: { id: competitionId, organizationId: orgId },
      select: {
        id: true,
        name: true,
        competitionType: true,
      },
    });
    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    const applications = await prisma.competitionTypeApplication.findMany({
      where: { competitionId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        requestedType: true,
        status: true,
        rejectionReason: true,
        reviewedAt: true,
        approvedAt: true,
        createdAt: true,
      },
      take: 20,
    });

    return NextResponse.json({
      competition,
      applications,
    });
  } catch (error) {
    return jsonInternalError500(
      "GET api/organizations/[orgId]/competitions/[competitionId]/type-applications/route.ts",
      error
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string; competitionId: string }> }
) {
  try {
    const { orgId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(orgId, session.userId, "operational");
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as PostBody;
    const requestedType =
      typeof body.requestedType === "string" ? body.requestedType.trim() : "";
    if (!allowedTypes.has(requestedType)) {
      return NextResponse.json({ error: "大会種別はA級またはB級を選択してください" }, { status: 400 });
    }

    const competition = await prisma.competition.findFirst({
      where: { id: competitionId, organizationId: orgId },
      select: { id: true, competitionType: true },
    });
    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    if (competition.competitionType === requestedType) {
      return NextResponse.json(
        { error: "現在の大会種別と同じため申請は不要です" },
        { status: 400 }
      );
    }

    const pending = await prisma.competitionTypeApplication.findFirst({
      where: { competitionId, status: "PENDING" },
      select: { id: true },
    });
    if (pending) {
      return NextResponse.json(
        { error: "審査中の大会種別申請があります。結果確定後に再申請してください" },
        { status: 400 }
      );
    }

    const created = await prisma.competitionTypeApplication.create({
      data: {
        competitionId,
        requestedType: requestedType as "A" | "B",
        status: "PENDING",
        requestedByUserId: session.userId,
      },
      select: {
        id: true,
        requestedType: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ application: created }, { status: 201 });
  } catch (error) {
    return jsonInternalError500(
      "POST api/organizations/[orgId]/competitions/[competitionId]/type-applications/route.ts",
      error
    );
  }
}
