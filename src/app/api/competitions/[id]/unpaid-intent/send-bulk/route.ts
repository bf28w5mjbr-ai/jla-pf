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
import {
  buildPaymentIntentPublicUrl,
  sendUnpaidEntryIntentEmail,
} from "@/lib/email/sendUnpaidEntryIntentEmail";
import {
  computePaymentIntentTokenExpiresAt,
  generatePaymentIntentRawToken,
  hashPaymentIntentToken,
} from "@/lib/paymentIntentToken";

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

  const deadlineLabel = responseDeadlineAt.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const sentAt = new Date();
  const expiresAt = computePaymentIntentTokenExpiresAt(responseDeadlineAt);

  const campaign = await prisma.competitionUnpaidEntryIntentCampaign.create({
    data: {
      competitionId,
      responseDeadlineAt,
      sentAt,
      sentByUserId: session.userId,
    },
  });

  let sentCount = 0;
  let failedCount = 0;
  const failures: { entryId: string; error: string }[] = [];

  for (const target of targets) {
    const rawToken = generatePaymentIntentRawToken();
    const tokenHash = hashPaymentIntentToken(rawToken);
    const intentUrl = buildPaymentIntentPublicUrl(competitionId, rawToken);

    try {
      await prisma.competitionEntryPaymentIntentToken.create({
        data: {
          campaignId: campaign.id,
          entryId: target.entryId,
          tokenHash,
          expiresAt,
          lastEmailSentAt: sentAt,
        },
      });

      await sendUnpaidEntryIntentEmail({
        to: target.email,
        competitionName: competition.name,
        participantName: target.fullName,
        responseDeadlineLabel: deadlineLabel,
        intentUrl,
      });
      sentCount += 1;
    } catch (err) {
      failedCount += 1;
      failures.push({
        entryId: target.entryId,
        error: err instanceof Error ? err.message : "送信失敗",
      });
    }
  }

  await logAuditAction({
    action: "COMPETITION_UNPAID_INTENT_BULK_SENT",
    actorType: "USER",
    actorKey: session.userId,
    actorUserId: session.userId,
    targetType: "CompetitionUnpaidEntryIntentCampaign",
    targetId: campaign.id,
    result: failedCount === 0 ? "SUCCESS" : "FAILURE",
    metadata: {
      competitionId,
      targetCount: targets.length,
      sentCount,
      failedCount,
      skippedNoEmail,
      responseDeadlineAt: responseDeadlineAt.toISOString(),
    },
    request: getRequestContext(request),
  });

  return NextResponse.json({
    message: `メールを ${sentCount} 件送信しました${failedCount > 0 ? `（失敗 ${failedCount} 件）` : ""}`,
    campaignId: campaign.id,
    sentCount,
    failedCount,
    skippedNoEmail,
    failures: failures.slice(0, 20),
  });
  } catch (e) {
    return jsonInternalError500(
      "POST api/competitions/[id]/unpaid-intent/send-bulk/route.ts",
      e
    );
  }
}
