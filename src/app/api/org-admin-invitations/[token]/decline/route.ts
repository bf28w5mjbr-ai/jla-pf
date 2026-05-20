import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import {
  declineOrgAdminInvitation,
  OrgAdminInvitationError,
  orgAdminInvitationErrorStatus,
} from "@/lib/orgAdminInvitationService";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const jar = await cookies();
    const sessionToken = jar.get("session")?.value;
    const session = sessionToken ? await verifySession(sessionToken) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    await declineOrgAdminInvitation(token, session.userId);

    return NextResponse.json({ message: "招待を辞退しました" });
  } catch (error) {
    if (error instanceof OrgAdminInvitationError) {
      return NextResponse.json(
        { error: error.message },
        { status: orgAdminInvitationErrorStatus(error.code) }
      );
    }
    return jsonInternalError500("POST org-admin-invitation decline", error);
  }
}
