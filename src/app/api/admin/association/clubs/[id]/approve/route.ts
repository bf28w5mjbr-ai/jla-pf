import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requireAccAdmin } from "@/lib/accessControl";
import { jsonInternalError500 } from "@/lib/apiInternalError";

// POST /api/admin/association/clubs/[id]/approve - 協会承認（APPLYING → JLA_APPROVED）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await params;

    // 認証確認
    const token = req.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireAccAdmin(session.userId);
    } catch {
      return NextResponse.json(
        { error: "協会管理者のみがクラブを承認できます" },
        { status: 403 }
      );
    }

    // クラブ取得
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        status: true,
        type: true,
      },
    });

    if (!club) {
      return NextResponse.json(
        { error: "クラブが見つかりません" },
        { status: 404 }
      );
    }

    // APPLYING状態のみ承認可能
    if (club.status !== "APPLYING") {
      return NextResponse.json(
        { error: `このクラブは現在${club.status}状態のため、承認できません` },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const body = await req.json().catch(() => ({}));

    // トランザクションで承認処理
    const result = await prisma.$transaction(async (tx) => {
      const pendingTypeApplication = await tx.clubTypeApplication.findFirst({
        where: {
          clubId,
          status: "PENDING",
          kind: "INITIAL",
        },
        orderBy: { createdAt: "desc" },
      });

      if (!pendingTypeApplication) {
        throw new Error("TYPE_APPLICATION_REQUIRED");
      }

      // クラブを JLA_APPROVED に変更
      const updated = await tx.club.updateMany({
        where: { id: clubId, status: "APPLYING" },
        data: {
          status: "JLA_APPROVED",
        },
      });

      if (updated.count === 0) {
        return null;
      }

      const updatedClub = await tx.club.findUnique({
        where: { id: clubId },
        select: {
          id: true,
          name: true,
          status: true,
          type: true,
        },
      });

      await tx.clubTypeApplication.update({
        where: { id: pendingTypeApplication.id },
        data: {
          status: "APPROVED",
          approvedById: session.userId,
          approvedAt: new Date(),
        },
      });

      // 監査ログ記録
      await tx.auditLog.create({
        data: {
          actorUserId: session.userId,
          action: "ACC_CLUB_APPROVE",
          target: clubId,
          meta: {
            previousStatus: "APPLYING",
            newStatus: "JLA_APPROVED",
          },
        },
      });

      return updatedClub;
    });

    if (!result) {
      return NextResponse.json(
        { error: "このクラブは現在APPLYING状態のためのみ承認できます" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      message: "クラブを協会承認しました",
      club: result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TYPE_APPLICATION_REQUIRED") {
      return NextResponse.json(
        { error: "クラブ種別の申請が提出されていません" },
        { status: 400 }
      );
    }
    return jsonInternalError500(
      "POST api/admin/association/clubs/[id]/approve/route.ts",
      error
    );
  }
}
