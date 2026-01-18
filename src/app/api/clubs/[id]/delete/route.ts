import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

// クラブ削除
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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
    const clubId = params.id;

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

    // OWNERかチェック
    const ownerMembership = club.memberships.find(
      (m) => m.userId === session.userId && m.role === "OWNER"
    );

    if (!ownerMembership) {
      return NextResponse.json(
        { error: "Only the club owner can delete the club" },
        { status: 403 }
      );
    }

    // リクエストボディから確認用のクラブ名を取得
    const body = await request.json();
    const { confirmName } = body;

    if (confirmName !== club.name) {
      return NextResponse.json(
        { error: "Club name confirmation does not match" },
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
        entityType: "Club",
        entityId: clubId,
        userId: session.userId,
        details: {
          clubName: club.name,
          memberCount: club.memberships.length,
        },
      },
    });

    return NextResponse.json({
      message: `クラブ「${club.name}」を削除しました`,
    });
  } catch (error) {
    console.error("Delete club error:", error);
    return NextResponse.json(
      { error: "Failed to delete club" },
      { status: 500 }
    );
  }
}
