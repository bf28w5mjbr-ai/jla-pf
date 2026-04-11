import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { normalizeOrgRoleForWrite } from "@/lib/roleScopes";
import { requireOrgAdmin } from "@/lib/accessControl";

// 役割変更
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ orgId: string; memberId: string }> }
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
    const organizationId = params.orgId;
    const memberId = params.memberId;

    // 管理者権限チェック
    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "役割変更は管理者のみ可能です" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { role } = body;

    if (!["ADMIN", "MEMBER"].includes(role)) {
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

    await prisma.orgAdmin.update({
      where: { id: memberId },
      data: { role: normalizeOrgRoleForWrite(role) },
    });

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
    return jsonInternalError500("PUT api/organizations/[orgId]/members/[memberId]/route.ts", error);
  }
}

// メンバー削除
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ orgId: string; memberId: string }> }
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
    const organizationId = params.orgId;
    const memberId = params.memberId;

    // 管理者権限チェック
    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "メンバー削除は管理者のみ可能です" },
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

    await prisma.orgAdmin.delete({
      where: { id: memberId },
    });

    return NextResponse.json({ message: "メンバーを削除しました" });
  } catch (error) {
    return jsonInternalError500("DELETE api/organizations/[orgId]/members/[memberId]/route.ts", error);
  }
}
