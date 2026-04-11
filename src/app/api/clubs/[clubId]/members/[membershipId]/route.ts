import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requireClubAdmin } from "@/lib/accessControl";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string; membershipId: string }> }
) {
  try {
    const { clubId, membershipId } = await params;

    // セッション確認
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 現在のユーザーが管理者かチェック
    try {
      await requireClubAdmin(clubId, sess.userId);
    } catch {
      return NextResponse.json(
        { error: "クラブ管理者のみがメンバーを削除できます" },
        { status: 403 }
      );
    }

    // 対象のメンバーシップを取得
    const targetMembership = await prisma.membership.findUnique({
      where: {
        id: membershipId,
      },
    });

    if (!targetMembership) {
      return NextResponse.json({ error: "メンバーシップが見つかりません" }, { status: 404 });
    }

    // メンバーシップを削除
    await prisma.membership.delete({
      where: {
        id: membershipId,
      },
    });

    return NextResponse.json({
      message: "メンバーを削除しました",
    });
  } catch (error) {
    return jsonInternalError500("DELETE api/clubs/[clubId]/members/[membershipId]/route.ts", error);
  }
}
