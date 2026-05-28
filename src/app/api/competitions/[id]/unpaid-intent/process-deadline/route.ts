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
  processAllOverdueCampaignDeadlines,
  processCampaignDeadline,
} from "@/lib/entryPaymentIntent";

type RouteContext = { params: Promise<{ id: string }> };

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;

  try {
    const cronOk = isCronAuthorized(request);
    let actorUserId: string | null = null;

    if (!cronOk) {
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
      actorUserId = session.userId;
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const campaignId = typeof b.campaignId === "string" ? b.campaignId.trim() : "";
    const allCompetitions = b.allCompetitions === true || cronOk;

    let entriesProcessed = 0;
    let campaignsProcessed = 0;

    if (allCompetitions && cronOk) {
      const result = await processAllOverdueCampaignDeadlines(prisma);
      entriesProcessed = result.entriesProcessed;
      campaignsProcessed = result.campaignsProcessed;
    } else if (campaignId) {
      const { processedCount } = await processCampaignDeadline(prisma, campaignId);
      entriesProcessed = processedCount;
      campaignsProcessed = 1;
    } else {
      const campaigns = await prisma.competitionUnpaidEntryIntentCampaign.findMany({
        where: {
          competitionId,
          responseDeadlineAt: { lt: new Date() },
        },
        select: { id: true },
      });
      for (const c of campaigns) {
        const { processedCount } = await processCampaignDeadline(prisma, c.id);
        entriesProcessed += processedCount;
      }
      campaignsProcessed = campaigns.length;
    }

    if (actorUserId) {
      await logAuditAction({
        action: "COMPETITION_UNPAID_INTENT_DEADLINE_DNS",
        actorType: "USER",
        actorKey: actorUserId,
        actorUserId,
        targetType: "Competition",
        targetId: competitionId,
        result: "SUCCESS",
        metadata: { entriesProcessed, campaignsProcessed },
        request: getRequestContext(request),
      });
    }

    return NextResponse.json({
      message: `期限切れ処理を実行しました（${entriesProcessed} 件のエントリーに DNS を適用）`,
      entriesProcessed,
      campaignsProcessed,
    });
  } catch (e) {
    return jsonInternalError500(
      "POST api/competitions/[id]/unpaid-intent/process-deadline/route.ts",
      e
    );
  }
}
