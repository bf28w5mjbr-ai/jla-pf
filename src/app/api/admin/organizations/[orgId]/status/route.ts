import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requirePfAdmin } from "@/lib/accessControl";
import {
  OrganizerLifecycleError,
  organizerLifecycleErrorStatus,
  transitionOrgStatus,
} from "@/lib/organizerLifecycle";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requirePfAdmin(session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const { orgId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    const suspendedReason =
      typeof body?.suspendedReason === "string" ? body.suspendedReason : undefined;

    if (action !== "suspend" && action !== "restore") {
      return NextResponse.json({ error: "action は suspend または restore" }, { status: 400 });
    }

    const updated = await transitionOrgStatus(
      orgId,
      action,
      session.userId,
      suspendedReason
    );

    return NextResponse.json({ organization: updated });
  } catch (error) {
    if (error instanceof OrganizerLifecycleError) {
      return NextResponse.json(
        { error: error.message },
        { status: organizerLifecycleErrorStatus(error.code) }
      );
    }
    return jsonInternalError500("POST admin/organizations/status", error);
  }
}
