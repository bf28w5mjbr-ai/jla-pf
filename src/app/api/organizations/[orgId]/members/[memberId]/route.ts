import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import {
  assertNotLastOrgAdmin,
  OrgAdminInvitationError,
  orgAdminInvitationErrorStatus,
} from "@/lib/orgAdminInvitationService";

// 役割変更
export async function PUT(
  _request: NextRequest,
  context: { params: Promise<{ orgId: string; memberId: string }> }
) {
  try {
    const token = _request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const params = await context.params;
    const organizationId = params.orgId;
    void params.memberId;

    // 管理者権限チェック
    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "役割変更は管理者のみ可能です" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "主催団体メンバーの役割変更は廃止されました" },
      { status: 405 }
    );
  } catch (error) {
    if (error instanceof OrgAdminInvitationError) {
      return NextResponse.json(
        { error: error.message },
        { status: orgAdminInvitationErrorStatus(error.code) }
      );
    }
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

    await prisma.$transaction(async (tx) => {
      await assertNotLastOrgAdmin(tx, organizationId, memberId);
      await tx.orgAdmin.delete({ where: { id: memberId } });
    });

    return NextResponse.json({ message: "メンバーを削除しました" });
  } catch (error) {
    if (error instanceof OrgAdminInvitationError) {
      return NextResponse.json(
        { error: error.message },
        { status: orgAdminInvitationErrorStatus(error.code) }
      );
    }
    return jsonInternalError500("DELETE api/organizations/[orgId]/members/[memberId]/route.ts", error);
  }
}
