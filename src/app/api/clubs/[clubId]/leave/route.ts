import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clubId: string }> }
) {
  try {
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { clubId } = await context.params;

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
    return jsonInternalError500("POST api/clubs/[clubId]/leave/route.ts", error);
  }
}
