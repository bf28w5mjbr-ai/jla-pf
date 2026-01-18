import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string; membershipId: string }> }
) {
  try {
    // セッション確認
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { id: clubId, membershipId } = await context.params;
    const body = await req.json();
    const { role } = body;

    // 役割の検証
    if (!role || !['MEMBER', 'ADMIN'].includes(role)) {
      return NextResponse.json(
        { error: "無効な役割です" },
        { status: 400 }
      );
    }

    // 現在のユーザーがクラブのオーナーかチェック
    const userMembership = await prisma.membership.findUnique({
      where: {
        userId_clubId: {
          userId: sess.userId,
          clubId: clubId,
        }
      }
    });

    if (!userMembership || userMembership.role !== 'OWNER') {
      return NextResponse.json(
        { error: "クラブのオーナーのみが役割を変更できます" },
        { status: 403 }
      );
    }

    // 対象のメンバーシップを取得
    const targetMembership = await prisma.membership.findUnique({
      where: { id: membershipId },
      include: {
        user: {
          select: {
            familyName: true,
            givenName: true,
          }
        }
      }
    });

    if (!targetMembership) {
      return NextResponse.json(
        { error: "メンバーシップが見つかりません" },
        { status: 404 }
      );
    }

    if (targetMembership.clubId !== clubId) {
      return NextResponse.json(
        { error: "このメンバーシップはこのクラブに属していません" },
        { status: 400 }
      );
    }

    // オーナーの役割は変更できない
    if (targetMembership.role === 'OWNER') {
      return NextResponse.json(
        { error: "オーナーの役割は変更できません" },
        { status: 400 }
      );
    }

    // 承認済みメンバーのみ役割変更可能
    if (targetMembership.status !== 'APPROVED') {
      return NextResponse.json(
        { error: "承認済みメンバーのみ役割を変更できます" },
        { status: 400 }
      );
    }

    // 役割を更新
    const updatedMembership = await prisma.membership.update({
      where: { id: membershipId },
      data: { role },
    });

    const actionText = role === 'ADMIN' ? '管理者に昇格' : '一般メンバーに降格';

    return NextResponse.json({
      message: `${targetMembership.user.familyName} ${targetMembership.user.givenName}さんを${actionText}しました`,
      membership: {
        id: updatedMembership.id,
        role: updatedMembership.role,
      }
    });
  } catch (error) {
    console.error("Update role error:", error);
    return NextResponse.json(
      { error: "役割の変更に失敗しました" },
      { status: 500 }
    );
  }
}
