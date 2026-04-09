import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../../lib/auth";
import { prisma } from "../../../../../server/db";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const primaryClubId = (user as { primaryClubId?: string | null } | null)?.primaryClubId ?? null;

    return NextResponse.json({ primaryClubId });
  } catch (error) {
    return jsonInternalError500("GET api/users/me/primary-club/route.ts", error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await req.json();
    const { clubId } = body;

    if (!clubId) {
      return NextResponse.json({ error: "clubId が必要です" }, { status: 400 });
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.userId,
        clubId,
        status: "APPROVED",
      },
      select: { id: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "承認済みのクラブのみメイン所属に設定できます" },
        { status: 400 }
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    const updated = await prisma.user.update({
      where: { id: session.userId },
      data: { primaryClubId: clubId } as Prisma.UserUncheckedUpdateInput,
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: session.userId,
        action: "PRIMARY_CLUB_CHANGE",
        target: session.userId,
        meta: {
          previousPrimaryClubId:
            (currentUser as { primaryClubId?: string | null } | null)?.primaryClubId || null,
          newPrimaryClubId: clubId,
          reason: "TRANSFER_MARK",
        },
      },
    });

    return NextResponse.json({
      message: "メイン所属クラブを更新しました",
      user: { id: updated.id, primaryClubId: (updated as { primaryClubId?: string | null }).primaryClubId ?? null },
    });
  } catch (error) {
    return jsonInternalError500("PUT api/users/me/primary-club/route.ts", error);
  }
}
