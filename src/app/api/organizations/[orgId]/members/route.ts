import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import {
  inviteOrgAdmin,
  OrgAdminInvitationError,
  orgAdminInvitationErrorStatus,
} from "@/lib/orgAdminInvitationService";

/** @deprecated 互換のため残す。即時追加せず招待を作成する。 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orgId: string }> }
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

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "メンバー招待の権限がありません" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId: bodyUserId, userEmail, email, role } = body ?? {};

    const rawUserId = typeof bodyUserId === "string" ? bodyUserId.trim() : "";
    const emailFromBody =
      (typeof userEmail === "string" ? userEmail.trim() : "") ||
      (typeof email === "string" ? email.trim() : "");

    if (!rawUserId && !emailFromBody) {
      return NextResponse.json(
        { error: "招待するユーザーを指定してください（userId またはメールアドレス）" },
        { status: 400 }
      );
    }

    const user = rawUserId
      ? await prisma.user.findFirst({
          where: { id: rawUserId, deletedAt: null },
        })
      : await prisma.user.findFirst({
          where: { email: emailFromBody, deletedAt: null },
        });

    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    const result = await inviteOrgAdmin(
      session.userId,
      organizationId,
      user.id,
      typeof role === "string" ? role : undefined
    );

    return NextResponse.json({
      message: "招待を送信しました。相手の承諾後にメンバーとして表示されます。",
      invitationId: result.invitationId,
    });
  } catch (error) {
    if (error instanceof OrgAdminInvitationError) {
      return NextResponse.json(
        { error: error.message },
        { status: orgAdminInvitationErrorStatus(error.code) }
      );
    }
    return jsonInternalError500("POST api/organizations/[orgId]/members/route.ts", error);
  }
}
