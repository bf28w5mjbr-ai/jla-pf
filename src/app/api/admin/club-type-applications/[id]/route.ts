import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../../lib/auth";
import { prisma } from "../../../../../server/db";
import { requireAccAdmin } from "../../../../../lib/accessControl";

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
      await requireAccAdmin(session.userId);
    } catch {
      return NextResponse.json({ error: "協会管理者権限が必要です" }, { status: 403 });
    }

    const body = await req.json();
    const { status, rejectionReason } = body;

    if (!status || !["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "不正なステータスです" }, { status: 400 });
    }

    const application = await prisma.clubTypeApplication.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!application) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }

    if (application.status !== "PENDING") {
      return NextResponse.json({ error: "既に審査済みです" }, { status: 400 });
    }

    const updated = await prisma.clubTypeApplication.update({
      where: { id },
      data: {
        status,
        rejectionReason: status === "REJECTED" ? rejectionReason ?? null : null,
        approvedById: status === "APPROVED" ? session.userId : null,
        approvedAt: status === "APPROVED" ? new Date() : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: session.userId,
        action: status === "APPROVED" ? "CLUB_TYPE_APPROVE" : "CLUB_TYPE_REJECT",
        target: id,
        meta: {
          rejectionReason: status === "REJECTED" ? rejectionReason ?? null : null,
        },
      },
    });

    return NextResponse.json({ application: updated });
  } catch (error) {
    return jsonInternalError500("PATCH api/admin/club-type-applications/[id]/route.ts", error);
  }
}
