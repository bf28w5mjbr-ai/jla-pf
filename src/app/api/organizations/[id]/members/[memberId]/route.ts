import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

// 役割変更
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; memberId: string }> }
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
    const organizationId = params.id;
    const memberId = params.memberId;

    // OWNERかチェック
    const ownerRole = await prisma.orgAdmin.findFirst({
      where: {
        organizationId,
        userId: session.userId,
        role: "OWNER",
      },
    });

    if (!ownerRole) {
      return NextResponse.json(
        { error: "役割変更はOWNERのみ可能です" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { role } = body;

    if (!["OWNER", "ADMIN", "MEMBER"].includes(role)) {
      return NextResponse.json(
        { error: "無効な役割です" },
        { status: 400 }
      );
    }

    // 対象メンバーを取得
    const targetMember = await prisma.orgAdmin.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "メンバーが見つかりません" },
        { status: 404 }
      );
    }

    // OWNERの役割変更は特別な処理が必要
    if (targetMember.role === "OWNER" && role !== "OWNER") {
      // 別のメンバーをOWNERに昇格させる場合は、現在のOWNERを降格
      await prisma.orgAdmin.update({
        where: { id: memberId },
        data: { role },
      });
    } else if (role === "OWNER") {
      // 新しいOWNERを設定し、現在のOWNERをADMINに降格
      await prisma.$transaction([
        prisma.orgAdmin.update({
          where: { id: ownerRole.id },
          data: { role: "ADMIN" },
        }),
        prisma.orgAdmin.update({
          where: { id: memberId },
          data: { role: "OWNER" },
        }),
      ]);
    } else {
      // 通常の役割変更
      await prisma.orgAdmin.update({
        where: { id: memberId },
        data: { role },
      });
    }

    const updatedMember = await prisma.orgAdmin.findUnique({
      where: { id: memberId },
      include: {
        user: {
          select: {
            id: true,
            familyName: true,
            givenName: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(updatedMember);
  } catch (error) {
    console.error("Change role error:", error);
    return NextResponse.json(
      { error: "役割の変更に失敗しました" },
      { status: 500 }
    );
  }
}

// メンバー削除
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; memberId: string }> }
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
    const organizationId = params.id;
    const memberId = params.memberId;

    // OWNERかチェック
    const ownerRole = await prisma.orgAdmin.findFirst({
      where: {
        organizationId,
        userId: session.userId,
        role: "OWNER",
      },
    });

    if (!ownerRole) {
      return NextResponse.json(
        { error: "メンバー削除はOWNERのみ可能です" },
        { status: 403 }
      );
    }

    // 対象メンバーを取得
    const targetMember = await prisma.orgAdmin.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "メンバーが見つかりません" },
        { status: 404 }
      );
    }

    // OWNERは削除できない
    if (targetMember.role === "OWNER") {
      return NextResponse.json(
        { error: "OWNERは削除できません。先に別のメンバーをOWNERに昇格させてください" },
        { status: 400 }
      );
    }

    await prisma.orgAdmin.delete({
      where: { id: memberId },
    });

    return NextResponse.json({ message: "メンバーを削除しました" });
  } catch (error) {
    console.error("Remove member error:", error);
    return NextResponse.json(
      { error: "メンバーの削除に失敗しました" },
      { status: 500 }
    );
  }
}
