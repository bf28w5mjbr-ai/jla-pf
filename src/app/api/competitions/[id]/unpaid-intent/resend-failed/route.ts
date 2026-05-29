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
  resendUndeliveredUnpaidIntentEmails,
  sendUnpaidIntentToNewTargets,
} from "@/lib/unpaidEntryIntentCampaignSend";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  if (!session?.userId) {
    return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* 空 body 可 */
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const extendDeadlineRaw =
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
    if (!process.env.RESEND_API_KEY?.trim()) {
      return NextResponse.json(
        { message: "メール送信が設定されていません（RESEND_API_KEY）" },
        { status: 503 }
      );
    }

    const campaign = await prisma.competitionUnpaidEntryIntentCampaign.findFirst({
      where: { competitionId },
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        responseDeadlineAt: true,
      },
    });
    if (!campaign) {
      return NextResponse.json(
        { message: "送信済みキャンペーンがありません。先に一括送信してください。" },
        { status: 404 }
      );
    }

    let responseDeadlineAt = campaign.responseDeadlineAt;
    if (extendDeadlineRaw) {
      const extended = new Date(extendDeadlineRaw);
      if (Number.isNaN(extended.getTime())) {
        return NextResponse.json({ message: "回答期限の形式が不正です" }, { status: 400 });
      }
      if (extended.getTime() <= Date.now()) {
        return NextResponse.json({ message: "回答期限は未来の日時を指定してください" }, { status: 400 });
      }
      responseDeadlineAt = extended;
      await prisma.competitionUnpaidEntryIntentCampaign.update({
        where: { id: campaign.id },
        data: { responseDeadlineAt },
      });
    } else if (responseDeadlineAt.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          message:
            "回答期限が過ぎています。再送する場合は body に未来の responseDeadlineAt（ISO）を指定してください。",
        },
        { status: 400 }
      );
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { name: true },
    });
    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    const base = {
      campaignId: campaign.id,
      competitionId,
      competitionName: competition.name,
      responseDeadlineAt,
    };

    const resend = await resendUndeliveredUnpaidIntentEmails(prisma, base);
    const added = await sendUnpaidIntentToNewTargets(prisma, base);

    const sentCount = resend.sentCount + added.sentCount;
    const failedCount = resend.failedCount + added.failedCount;
    const failures = [...resend.failures, ...added.failures];

    await logAuditAction({
      action: "COMPETITION_UNPAID_INTENT_RESEND",
      actorType: "USER",
      actorKey: session.userId,
      actorUserId: session.userId,
      targetType: "CompetitionUnpaidEntryIntentCampaign",
      targetId: campaign.id,
      result: failedCount === 0 ? "SUCCESS" : "FAILURE",
      metadata: {
        competitionId,
        sentCount,
        failedCount,
        skippedNotTarget: resend.skippedNotTarget,
        newTargetsSent: added.sentCount,
        responseDeadlineAt: responseDeadlineAt.toISOString(),
      },
      request: getRequestContext(request),
    });

    const status = failedCount > 0 ? 207 : 200;
    return NextResponse.json(
      {
        message:
          sentCount === 0
            ? `再送対象はありませんでした${failedCount > 0 ? `（失敗 ${failedCount} 件）` : ""}`
            : `メールを ${sentCount} 件送信しました${failedCount > 0 ? `（失敗 ${failedCount} 件）` : ""}`,
        campaignId: campaign.id,
        sentCount,
        failedCount,
        skippedNotTarget: resend.skippedNotTarget,
        newTargetsSent: added.sentCount,
        failures: failures.slice(0, 20),
        responseDeadlineAt: responseDeadlineAt.toISOString(),
      },
      { status }
    );
  } catch (e) {
    return jsonInternalError500(
      "POST api/competitions/[id]/unpaid-intent/resend-failed/route.ts",
      e
    );
  }
}
