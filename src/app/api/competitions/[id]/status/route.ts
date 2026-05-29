import { jsonInternalError500 } from "@/lib/apiInternalError";
import type { Prisma } from "@prisma/client";
import { CompetitionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { getCompetitionPublishErrors } from "@/lib/competitionPublishRules";
import { revalidateCompetitionPublicPage } from "@/lib/revalidateCompetitionPublicPage";
import {
  isCompetitionStatus,
  validateCompetitionStatusTransition,
} from "@/lib/competitionStatusRules";
import {
  hostOrgAdminGateJsonError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { status } = await request.json();
    if (!isCompetitionStatus(status)) {
      return NextResponse.json(
        {
          errorCode: "INVALID_STATUS",
          error: "不正なステータスです",
          allowedStatuses: Object.values(CompetitionStatus),
        },
        { status: 400 }
      );
    }

    try {
      await requireHostOrgAdminForCompetition(id, session.userId);
    } catch (e) {
      const gated = hostOrgAdminGateJsonError(e);
      if (gated) {
        return NextResponse.json(
          {
            errorCode: gated.status === 404 ? "COMPETITION_NOT_FOUND" : "FORBIDDEN",
            error: gated.error,
          },
          { status: gated.status }
        );
      }
      throw e;
    }

    const competition = await prisma.competition.findUnique({
      where: { id },
      include: {
        events: { select: { id: true } },
        organization: { select: { status: true } },
      },
    });

    if (!competition) {
      return NextResponse.json(
        { errorCode: "COMPETITION_NOT_FOUND", error: "Competition not found" },
        { status: 404 }
      );
    }

    const transition = validateCompetitionStatusTransition(competition.status, status);
    if (!transition.ok) {
      return NextResponse.json(
        {
          errorCode: transition.code,
          error: transition.message,
          currentStatus: competition.status,
          nextStatus: status,
        },
        { status: 400 }
      );
    }

    if (
      status === "PUBLISHED" &&
      competition.status !== "PUBLISHED" &&
      !competition.isPublished
    ) {
      const publishErrors = getCompetitionPublishErrors({
        ...competition,
        organization: { status: competition.organization.status },
      });
      if (publishErrors.length > 0) {
        return NextResponse.json(
          {
            errorCode: "PUBLISH_REQUIREMENTS_NOT_MET",
            error: "公開条件を満たしていません",
            ...(process.env.NODE_ENV !== "production"
              ? { details: publishErrors }
              : {}),
          },
          { status: 400 }
        );
      }
    }

    // ステータスを更新
    const updateData: Prisma.CompetitionUpdateInput = {
      status: status as CompetitionStatus,
    };

    // PUBLISHEDに変更する場合、isPublishedとpublishedAtも設定
    if (status === "PUBLISHED") {
      updateData.isPublished = true;
      if (!competition.publishedAt) {
        updateData.publishedAt = new Date();
      }
      // 初回公開時に誓約がオフなら、以後は誓約を有効化できない（publishedAt がある再公開では付けない）
      if (!competition.publishedAt && !competition.entryPledgeEnabled) {
        updateData.entryPledgeLockNoOffer = true;
      }
    }

    // DRAFTに戻す場合、isPublishedをfalseに
    if (status === "DRAFT") {
      updateData.isPublished = false;
    }

    const updatedCompetition = await prisma.competition.update({
      where: { id },
      data: updateData,
    });

    revalidateCompetitionPublicPage(id);

    await logAuditAction({
      action: "COMPETITION_STATUS_UPDATE",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      actorUserId: session.userId,
      targetType: "Competition",
      targetId: id,
      targetKey: `competition:${id}`,
      metadata: {
        previousStatus: competition.status,
        nextStatus: status,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json(updatedCompetition);
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/status/route.ts", error);
  }
}
