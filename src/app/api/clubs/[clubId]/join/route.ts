import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;

    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // クラブが存在するか確認
    const club = await prisma.club.findUnique({
      where: { id: clubId },
    });

    if (!club) {
      return NextResponse.json({ error: "クラブが見つかりません" }, { status: 404 });
    }

    // 既に参加申請しているかチェック
    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_clubId: {
          userId: session.userId,
          clubId: clubId,
        }
      }
    });

    if (existingMembership) {
      return NextResponse.json({ error: "既に参加申請済みです" }, { status: 400 });
    }

    // メンバーシップを作成
    const membership = await prisma.membership.create({
      data: {
        userId: session.userId,
        clubId: clubId,
        role: "MEMBER",
        status: "PENDING", // 承認待ち
      },
    });

    return NextResponse.json({
      message: "参加申請を送信しました",
      membership: {
        id: membership.id,
        status: membership.status,
      },
    });
  } catch (error) {
    return jsonInternalError500("POST api/clubs/[clubId]/join/route.ts", error);
  }
}
