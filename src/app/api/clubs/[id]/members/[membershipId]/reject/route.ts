import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function POST(
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
        { error: "クラブのオーナーまたは管理者のみがメンバーを拒否できます" },
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
    console.error("Reject member error:", error);
    return NextResponse.json(
      { error: "メンバーの拒否に失敗しました" },
      { status: 500 }
    );
  }
}
