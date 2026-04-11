import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requireClubAdmin } from "@/lib/accessControl";

export async function POST(
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
        { error: "クラブの管理者のみがメンバーを拒否できます" },
        { status: 403 }
      );
    }

    // メンバーシップを拒否
    const membership = await prisma.membership.update({
      where: {
        id: membershipId,
      },
      data: {
        status: 'REJECTED',
      },
    });

    return NextResponse.json({
      message: "メンバーを拒否しました",
      membership,
    });
  } catch (error) {
    return jsonInternalError500("POST api/clubs/[clubId]/members/[membershipId]/reject/route.ts", error);
  }
}
