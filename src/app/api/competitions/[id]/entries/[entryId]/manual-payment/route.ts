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
  canRecordOrganizerManualPayment,
  expirePendingEntryCheckoutSessions,
  loadEntryForOrganizerPostPay,
} from "@/lib/entryOrganizerPostPayService";

type RouteContext = { params: Promise<{ id: string; entryId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId, entryId } = await context.params;
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  if (!session?.userId) {
    return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const noteRaw = typeof b.note === "string" ? b.note.trim() : "";
  const note = noteRaw.length > 0 ? noteRaw.slice(0, 2000) : null;

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
    if (!canRecordOrganizerManualPayment(entry)) {
      return NextResponse.json(
        { message: "このエントリーは手動入金を記録できません（後払い承認済み・未入金のみ可能）" },
        { status: 400 }
      );
    }

    const now = new Date();
    const expiredSessions = await prisma.$transaction(async (tx) => {
      await tx.competitionEntry.update({
        where: { id: entryId },
        data: {
          organizerManualPaidAt: now,
          organizerManualPaidByUserId: session.userId,
          organizerManualPaidNote: note,
        },
      });
      return expirePendingEntryCheckoutSessions(tx, entryId);
    });

    await logAuditAction({
      action: "COMPETITION_ENTRY_MANUAL_PAYMENT_RECORDED",
      actorType: "USER",
      actorKey: session.userId,
      actorUserId: session.userId,
      targetType: "CompetitionEntry",
      targetId: entryId,
      result: "SUCCESS",
      metadata: {
        competitionId,
        totalFee: entry.totalFee,
        expiredCheckoutSessions: expiredSessions,
        hasNote: Boolean(note),
      },
      request: getRequestContext(request),
    });

    return NextResponse.json({
      message: "手動入金を記録しました",
      entryId,
    });
  } catch (e) {
    return jsonInternalError500(
      "POST api/competitions/[id]/entries/[entryId]/manual-payment/route.ts",
      e
    );
  }
}
