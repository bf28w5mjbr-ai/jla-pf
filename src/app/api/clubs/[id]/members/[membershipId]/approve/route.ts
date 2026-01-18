import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; membershipId: string }> }
) {
  try {
    const { id, membershipId } = await params;

    // セッション確認
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const clubId = id;

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
        { error: "クラブのオーナーまたは管理者のみがメンバーを承認できます" },
        { status: 403 }
      );
    }

    // メンバーシップを承認
    const membership = await prisma.membership.update({
      where: {
        id: membershipId,
      },
      data: {
        status: 'APPROVED',
      },
    });

    return NextResponse.json({
      message: "メンバーを承認しました",
      membership,
    });
  } catch (error) {
    console.error("Approve member error:", error);
    return NextResponse.json(
      { error: "メンバーの承認に失敗しました" },
      { status: 500 }
    );
  }
}
