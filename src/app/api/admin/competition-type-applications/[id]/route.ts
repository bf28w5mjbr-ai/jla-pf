import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requirePfAdmin } from "@/lib/accessControl";
import { jsonInternalError500 } from "@/lib/apiInternalError";

type PatchBody = {
  action?: unknown;
  rejectReason?: unknown;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requirePfAdmin(session.userId);
    } catch {
      return NextResponse.json({ error: "PF管理者権限が必要です" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const action = typeof body.action === "string" ? body.action : "";
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "不正な操作です" }, { status: 400 });
    }

    const application = await prisma.competitionTypeApplication.findUnique({
      where: { id },
      select: { id: true, status: true, competitionId: true, requestedType: true },
    });
    if (!application) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }
    if (application.status !== "PENDING") {
      return NextResponse.json({ error: "既に審査済みです" }, { status: 400 });
    }

    const rejectReason =
      typeof body.rejectReason === "string" ? body.rejectReason.trim() : null;

    await prisma.$transaction(async (tx) => {
      if (action === "approve") {
        await tx.competition.update({
          where: { id: application.competitionId },
          data: { competitionType: application.requestedType },
        });
      }

      await tx.competitionTypeApplication.update({
        where: { id: application.id },
        data: {
          status: action === "approve" ? "APPROVED" : "REJECTED",
          reviewedByUserId: session.userId,
          reviewedAt: new Date(),
          approvedAt: action === "approve" ? new Date() : null,
          rejectionReason: action === "reject" ? rejectReason : null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.userId,
          action:
            action === "approve"
              ? "COMPETITION_TYPE_APPLICATION_APPROVE"
              : "COMPETITION_TYPE_APPLICATION_REJECT",
          target: application.id,
          meta: {
            competitionId: application.competitionId,
            requestedType: application.requestedType,
            rejectReason: action === "reject" ? rejectReason : null,
          },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonInternalError500(
      "PATCH api/admin/competition-type-applications/[id]/route.ts",
      error
    );
  }
}
