import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  hostOrgAdminGateMessageError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";
import { logAuditAction, getRequestContext } from "@/lib/auditLog";
import { listUnpaidIntentEmailTargets } from "@/lib/entryPaymentIntent";
import { runInitialUnpaidIntentBulkSend } from "@/lib/unpaidEntryIntentCampaignSend";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  if (!session?.userId) {
    return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON が不正です" }, { status: 400 });
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const previewOnly = b.preview === true;
  const deadlineRaw =
    typeof b.responseDeadlineAt === "string" ? b.responseDeadlineAt.trim() : "";

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
    const { targets, skippedNoEmail } = await listUnpaidIntentEmailTargets(prisma, competitionId);

    if (!deadlineRaw && !previewOnly) {
      return NextResponse.json(
        { message: "回答期限（responseDeadlineAt）を指定してください" },
        { status: 400 }
      );
    }

    const responseDeadlineAt = deadlineRaw ? new Date(deadlineRaw) : null;
    if (responseDeadlineAt && Number.isNaN(responseDeadlineAt.getTime())) {
      return NextResponse.json({ message: "回答期限の形式が不正です" }, { status: 400 });
    }
    if (responseDeadlineAt && responseDeadlineAt.getTime() <= Date.now()) {
      return NextResponse.json({ message: "回答期限は未来の日時を指定してください" }, { status: 400 });
    }

    if (previewOnly || !responseDeadlineAt) {
      return NextResponse.json({
        preview: true,
        targetCount: targets.length,
        skippedNoEmail,
      });
    }

    if (!process.env.RESEND_API_KEY?.trim()) {
      return NextResponse.json(
        { message: "メール送信が設定されていません（RESEND_API_KEY）" },
        { status: 503 }
      );
    }

    const existingCampaign = await prisma.competitionUnpaidEntryIntentCampaign.findFirst({
      where: { competitionId },
      select: { id: true },
    });
    if (existingCampaign) {
      return NextResponse.json(
        {
          message:
            "この大会では既に出場意思確認メールを送信済みです。「未達分を再送」から再送してください。",
          campaignId: existingCampaign.id,
        },
        { status: 409 }
      );
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { name: true },
    });
    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    if (targets.length === 0) {
      return NextResponse.json(
        { message: "送信対象の未決済エントリーがありません", skippedNoEmail },
        { status: 400 }
      );
    }

    const result = await runInitialUnpaidIntentBulkSend(prisma, {
      competitionId,
      competitionName: competition.name,
      responseDeadlineAt,
      sentByUserId: session.userId,
      targets,
    });

    if (result.sentCount === 0 && result.failedCount > 0) {
      await prisma.competitionUnpaidEntryIntentCampaign.delete({
        where: { id: result.campaignId },
      });
    }

    await logAuditAction({
      action: "COMPETITION_UNPAID_INTENT_BULK_SENT",
      actorType: "USER",
      actorKey: session.userId,
      actorUserId: session.userId,
      targetType: "CompetitionUnpaidEntryIntentCampaign",
      targetId: result.campaignId,
      result: result.failedCount === 0 ? "SUCCESS" : "FAILURE",
      metadata: {
        competitionId,
        targetCount: targets.length,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        skippedNoEmail,
        responseDeadlineAt: responseDeadlineAt.toISOString(),
      },
      request: getRequestContext(request),
    });

    const status = result.failedCount > 0 ? 207 : 200;
    return NextResponse.json(
      {
        message:
          result.sentCount === 0
            ? `メール送信に失敗しました（${result.failedCount} 件）`
            : `メールを ${result.sentCount} 件送信しました${result.failedCount > 0 ? `（失敗 ${result.failedCount} 件）` : ""}`,
        campaignId: result.sentCount === 0 ? undefined : result.campaignId,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        skippedNoEmail,
        failures: result.failures.slice(0, 20),
      },
      { status }
    );
  } catch (e) {
    return jsonInternalError500(
      "POST api/competitions/[id]/unpaid-intent/send-bulk/route.ts",
      e
    );
  }
}
