import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  hostOrgAdminGateMessageError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";
import { logAuditAction, getRequestContext } from "@/lib/auditLog";
import {
  canRevokeOrganizerPostPay,
  loadEntryForOrganizerPostPay,
} from "@/lib/entryOrganizerPostPayService";
import {
  loadCandidateEventIdsForCompetitionEntry,
  syncStartListSnapshotBeforeMarshal,
} from "@/lib/startListSnapshotOnEntryIncrease";

type RouteContext = { params: Promise<{ id: string; entryId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId, entryId } = await context.params;
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  if (!session?.userId) {
    return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
  }

  try {
    await requireHostOrgAdminForCompetition(competitionId, session.userId);
  } catch (e) {
    const gated = hostOrgAdminGateMessageError(e);
    if (gated) {
      return NextResponse.json({ message: gated.message }, { status: gated.status });
    }
    throw e;
  }

  try {
    const entry = await loadEntryForOrganizerPostPay(prisma, competitionId, entryId);
    if (!entry) {
      return NextResponse.json({ message: "エントリーが見つかりません" }, { status: 404 });
    }
    if (!canRevokeOrganizerPostPay(entry)) {
      return NextResponse.json(
        { message: "入金済みのため後払い承認を取り消せません" },
        { status: 400 }
      );
    }

    await prisma.competitionEntry.update({
      where: { id: entryId },
      data: {
        organizerPostPayApprovedAt: null,
        organizerPostPayApprovedByUserId: null,
      },
    });

    await logAuditAction({
      action: "COMPETITION_ENTRY_POST_PAY_REVOKED",
      actorType: "USER",
      actorKey: session.userId,
      actorUserId: session.userId,
      targetType: "CompetitionEntry",
      targetId: entryId,
      result: "SUCCESS",
      metadata: { competitionId, totalFee: entry.totalFee },
      request: getRequestContext(request),
    });

    const entryEvents = await loadCandidateEventIdsForCompetitionEntry(entryId);
    if (entryEvents) {
      await syncStartListSnapshotBeforeMarshal({
        competitionId: entryEvents.competitionId,
        candidateEventIds: entryEvents.eventIds,
        createdByUserId: session.userId,
        trigger: "POST_PAY_REVOKE",
        request,
      });
    }

    return NextResponse.json({
      message: "後払い承認を取り消しました",
      entryId,
    });
  } catch (e) {
    return jsonInternalError500(
      "POST api/competitions/[id]/entries/[entryId]/post-pay/revoke/route.ts",
      e
    );
  }
}
