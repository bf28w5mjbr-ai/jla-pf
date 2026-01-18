import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const { clubId } = body;

    if (!clubId) {
      return NextResponse.json({ error: "クラブIDが必要です" }, { status: 400 });
    }

    // クラブが存在するか確認
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        status: true,
      }
    });

    if (!club) {
      return NextResponse.json({ error: "クラブが見つかりません" }, { status: 404 });
    }

    // クラブが参加可能な状態か確認
    if (club.status !== 'ACTIVE' && club.status !== 'JLA_APPROVED') {
      return NextResponse.json({ error: "このクラブは現在参加申請を受け付けていません" }, { status: 400 });
    }

    // 既に申請済みまたは所属しているか確認
    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_clubId: {
          userId: session.userId,
          clubId: clubId,
        }
      }
    });

    if (existingMembership) {
      if (existingMembership.status === 'APPROVED') {
        return NextResponse.json({ error: "既にこのクラブに所属しています" }, { status: 400 });
      } else if (existingMembership.status === 'PENDING') {
        return NextResponse.json({ error: "既に参加申請を送信済みです" }, { status: 400 });
      } else if (existingMembership.status === 'REJECTED') {
        return NextResponse.json({ error: "このクラブからの参加が拒否されています" }, { status: 400 });
      }
    }

    // 参加申請を作成
    const membership = await prisma.membership.create({
      data: {
        userId: session.userId,
        clubId: clubId,
        role: 'MEMBER',
        status: 'PENDING',
      },
      include: {
        club: {
          select: {
            name: true,
          }
        }
      }
    });

    return NextResponse.json({
      message: `${club.name}に参加申請を送信しました`,
      membership: {
        id: membership.id,
        clubName: membership.club.name,
        status: membership.status,
      }
    });
  } catch (error) {
    console.error("Apply to club error:", error);
    return NextResponse.json(
      { error: "参加申請に失敗しました" },
      { status: 500 }
    );
  }
}
