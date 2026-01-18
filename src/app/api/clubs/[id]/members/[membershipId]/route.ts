import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; membershipId: string } }
) {
  try {
    // セッション確認
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const clubId = params.id;
    const membershipId = params.membershipId;

    // 現在のユーザーがオーナーまたは管理者かチェック
    const userMembership = await prisma.membership.findUnique({
      where: {
        userId_clubId: {
          userId: sess.userId,
          clubId: clubId,
        }
      }
    });

    if (!userMembership || (userMembership.role !== 'OWNER' && userMembership.role !== 'ADMIN')) {
      return NextResponse.json(
        { error: "クラブのオーナーまたは管理者のみがメンバーを削除できます" },
        { status: 403 }
      );
    }

    // 対象のメンバーシップを取得してオーナーでないことを確認
    const targetMembership = await prisma.membership.findUnique({
      where: {
        id: membershipId,
      },
    });

    if (!targetMembership) {
      return NextResponse.json({ error: "メンバーシップが見つかりません" }, { status: 404 });
    }

    if (targetMembership.role === 'OWNER') {
      return NextResponse.json(
        { error: "オーナーは削除できません" },
        { status: 403 }
      );
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
    console.error("Remove member error:", error);
    return NextResponse.json(
      { error: "メンバーの削除に失敗しました" },
      { status: 500 }
    );
  }
}
