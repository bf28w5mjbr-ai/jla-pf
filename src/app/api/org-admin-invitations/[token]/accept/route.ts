import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import {
  acceptOrgAdminInvitation,
  OrgAdminInvitationError,
  orgAdminInvitationErrorStatus,
} from "@/lib/orgAdminInvitationService";
import { OrganizerLifecycleError } from "@/lib/organizerLifecycle";

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

    const result = await acceptOrgAdminInvitation(token, session.userId);

    return NextResponse.json({
      message: "招待を承諾しました",
      organizationId: result.organizationId,
    });
  } catch (error) {
    if (error instanceof OrgAdminInvitationError || error instanceof OrganizerLifecycleError) {
      const code = "code" in error ? String(error.code) : "UNKNOWN";
      return NextResponse.json(
        { error: error.message },
        { status: orgAdminInvitationErrorStatus(code) }
      );
    }
    return jsonInternalError500("POST org-admin-invitation accept", error);
  }
}
