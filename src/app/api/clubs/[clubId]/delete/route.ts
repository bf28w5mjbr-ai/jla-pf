import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { requireClubAdmin } from "@/lib/accessControl";
import {
  getClubDeleteBlockers,
  clubDeleteBlockersMessage,
} from "@/lib/clubDeleteGuards";

// クラブ削除
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ clubId: string }> }
) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const params = await context.params;
    const clubId = params.clubId;

    // クラブを取得
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        memberships: true,
      },
    });

    if (!club) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    // 管理者権限チェック
    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "Only club admins can delete the club" },
        { status: 403 }
      );
    }

    // リクエストボディから確認用のクラブ名を取得
    const body = await request.json();
    const { confirmName } = body;

    if (confirmName !== club.name) {
      return NextResponse.json(
        { error: "クラブ名が一致しません" },
        { status: 400 }
      );
    }

    const blockers = await getClubDeleteBlockers(clubId);
    if (blockers.length > 0) {
      return NextResponse.json(
        { error: clubDeleteBlockersMessage(blockers) },
        { status: 400 }
      );
    }

    // クラブを削除（Cascadeでメンバーシップ、お知らせ、活動記録も削除される）
    await prisma.club.delete({
      where: { id: clubId },
    });

    // 監査ログを作成
    await prisma.auditLog.create({
      data: {
        action: "DELETE_CLUB",
        actorUserId: session.userId,
        target: `club:${clubId}`,
        meta: {
          entityType: "Club",
          entityId: clubId,
          clubName: club.name,
          memberCount: club.memberships.length,
        },
      },
    });

    return NextResponse.json({
      message: `クラブ「${club.name}」を削除しました`,
    });
  } catch (error) {
    return jsonInternalError500("DELETE api/clubs/[clubId]/delete/route.ts", error);
  }
}
