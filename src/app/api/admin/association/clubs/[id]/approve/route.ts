import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requireAccAdmin } from "@/lib/accessControl";
import { jsonInternalError500 } from "@/lib/apiInternalError";

/**
 * POST /api/admin/association/clubs/[id]/approve
 * [id] = ClubTypeApplication ID（クラブ種別申請の承認。クラブ status は変更しない）
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    const token = req.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireAccAdmin(session.userId);
    } catch {
      return NextResponse.json(
        { error: "協会管理者のみが種別申請を承認できます" },
        { status: 403 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const application = await tx.clubTypeApplication.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          clubId: true,
          status: true,
          requestedType: true,
          kind: true,
        },
      });

      if (!application) {
        throw new Error("APPLICATION_NOT_FOUND");
      }

      if (application.status !== "PENDING") {
        throw new Error("INVALID_APPLICATION_STATUS");
      }

      const updatedApplication = await tx.clubTypeApplication.update({
        where: { id: applicationId },
        data: {
          status: "APPROVED",
          approvedById: session.userId,
          approvedAt: new Date(),
        },
      });

      await tx.club.update({
        where: { id: application.clubId },
        data: { type: application.requestedType },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.userId,
          action: "CLUB_TYPE_APPROVE",
          target: applicationId,
          meta: {
            clubId: application.clubId,
            requestedType: application.requestedType,
            kind: application.kind,
          },
        },
      });

      return updatedApplication;
    });

    return NextResponse.json({
      message: "クラブ種別申請を承認しました",
      application: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "APPLICATION_NOT_FOUND") {
        return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
      }
      if (error.message === "INVALID_APPLICATION_STATUS") {
        return NextResponse.json({ error: "審査待ちの申請のみ承認できます" }, { status: 400 });
      }
    }
    return jsonInternalError500(
      "POST api/admin/association/clubs/[id]/approve/route.ts",
      error
    );
  }
}
