import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../../lib/auth";
import { prisma } from "../../../../../server/db";
import { requireClubAdmin } from "../../../../../lib/accessControl";
import { isUpdateWindow, getNextFiscalYear, getCurrentFiscalYear } from "../../../../../lib/clubTypeSchedule";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const applications = await prisma.clubTypeApplication.findMany({
      where: { clubId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        requestedType: true,
        status: true,
        kind: true,
        targetFiscalYear: true,
        rejectionReason: true,
        approvedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ applications });
  } catch (error) {
    return jsonInternalError500("GET api/clubs/[clubId]/type-applications/route.ts", error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const body = await req.json();
    const { requestedType } = body;

    if (!requestedType || !["FIRST", "SECOND", "THIRD", "FOURTH"].includes(requestedType)) {
      return NextResponse.json(
        { error: "クラブ種別（FIRST/SECOND/THIRD/FOURTH）の指定が必要です" },
        { status: 400 }
      );
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, type: true, status: true },
    });

    if (!club) {
      return NextResponse.json({ error: "クラブが見つかりません" }, { status: 404 });
    }

    const existingPending = await prisma.clubTypeApplication.findFirst({
      where: {
        clubId,
        status: "PENDING",
      },
      select: { id: true },
    });

    if (existingPending) {
      return NextResponse.json(
        { error: "審査中の申請があるため新規申請できません" },
        { status: 400 }
      );
    }

    const kind = club.type ? "CHANGE" : "INITIAL";

    if (kind === "CHANGE" && club.type === requestedType) {
      return NextResponse.json(
        { error: "現在のクラブ種別と同じため変更申請できません" },
        { status: 400 }
      );
    }

    if (kind === "CHANGE" && !isUpdateWindow()) {
      return NextResponse.json(
        { error: "種別変更申請は3/1〜3/31の更新期間のみ可能です" },
        { status: 400 }
      );
    }

    const targetFiscalYear = kind === "CHANGE"
      ? getNextFiscalYear()
      : getCurrentFiscalYear();

    const application = await prisma.clubTypeApplication.create({
      data: {
        clubId,
        requestedType,
        kind,
        status: "PENDING",
        targetFiscalYear,
        requestedById: session.userId,
      },
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    return jsonInternalError500("POST api/clubs/[clubId]/type-applications/route.ts", error);
  }
}
