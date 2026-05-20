import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  transitionClubStatus,
  ClubOperationalError,
  type ClubStatusTransitionAction,
} from "@/lib/clubLifecycle";
import { isPfAdminRole } from "@/lib/governancePolicy";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;

    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { role: true },
    });

    if (!isPfAdminRole(user?.role)) {
      return NextResponse.json({ error: "PF管理者権限が必要です" }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action as ClubStatusTransitionAction;

    if (action !== "suspend" && action !== "restore") {
      return NextResponse.json(
        { error: "action は suspend または restore を指定してください" },
        { status: 400 }
      );
    }

    const club = await transitionClubStatus(clubId, action, sess.userId);

    return NextResponse.json({
      message: action === "suspend" ? "クラブを停止しました" : "クラブの運用を再開しました",
      club,
    });
  } catch (error) {
    if (error instanceof ClubOperationalError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonInternalError500("PUT api/admin/clubs/[clubId]/status/route.ts", error);
  }
}
