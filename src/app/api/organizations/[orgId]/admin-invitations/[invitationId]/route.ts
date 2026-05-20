import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import {
  cancelOrgAdminInvitation,
  OrgAdminInvitationError,
  orgAdminInvitationErrorStatus,
} from "@/lib/orgAdminInvitationService";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ orgId: string; invitationId: string }> }
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

    const { orgId: organizationId, invitationId } = await context.params;

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    await cancelOrgAdminInvitation(session.userId, organizationId, invitationId);

    return NextResponse.json({ message: "招待を取り消しました" });
  } catch (error) {
    if (error instanceof OrgAdminInvitationError) {
      return NextResponse.json(
        { error: error.message },
        { status: orgAdminInvitationErrorStatus(error.code) }
      );
    }
    return jsonInternalError500("DELETE admin-invitation", error);
  }
}
