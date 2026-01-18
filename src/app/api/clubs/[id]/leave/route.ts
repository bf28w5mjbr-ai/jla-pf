import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { id: clubId } = await context.params;

    // 現在のユーザーのメンバーシップを取得
    const membership = await prisma.membership.findUnique({
      where: {
        userId_clubId: {
          userId: sess.userId,
          clubId: clubId,
        }
      },
      include: {
        club: {
          select: {
            name: true,
          }
        }
      }
    });

    if (!membership) {
      return NextResponse.json(
        { error: "このクラブに所属していません" },
        { status: 404 }
      );
    }

    // オーナーは退会できない
    if (membership.role === 'OWNER') {
      return NextResponse.json(
        { error: "クラブのオーナーは退会できません。クラブを削除するか、他のメンバーにオーナー権限を譲渡してください。" },
        { status: 400 }
      );
    }

    // メンバーシップを削除
    await prisma.membership.delete({
      where: {
        id: membership.id,
      }
    });

    return NextResponse.json({
      message: `${membership.club.name}から退会しました`,
    });
  } catch (error) {
    console.error("Leave club error:", error);
    return NextResponse.json(
      { error: "退会処理に失敗しました" },
      { status: 500 }
    );
  }
}
