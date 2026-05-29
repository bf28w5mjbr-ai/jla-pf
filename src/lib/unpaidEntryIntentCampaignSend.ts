import type { PrismaClient } from "@prisma/client";

import {
  buildPaymentIntentPublicUrl,
  sendUnpaidEntryIntentEmail,
} from "@/lib/email/sendUnpaidEntryIntentEmail";
import {
  entryQualifiesForUnpaidIntentEmail,
  listUnpaidIntentEmailTargets,
  type UnpaidIntentEmailTarget,
} from "@/lib/entryPaymentIntent";
import {
  computePaymentIntentTokenExpiresAt,
  generatePaymentIntentRawToken,
  hashPaymentIntentToken,
} from "@/lib/paymentIntentToken";

export type IntentEmailSendResult = {
  sentCount: number;
  failedCount: number;
  skippedNotTarget: number;
  failures: { entryId: string; error: string }[];
};

const RESEND_SEND_INTERVAL_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDeadlineLabel(deadline: Date): string {
  return deadline.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function deliverIntentEmail(
  prisma: PrismaClient,
  params: {
    tokenId: string;
    competitionId: string;
    competitionName: string;
    responseDeadlineAt: Date;
    target: UnpaidIntentEmailTarget;
  }
): Promise<void> {
  const rawToken = generatePaymentIntentRawToken();
  const tokenHash = hashPaymentIntentToken(rawToken);
  const intentUrl = buildPaymentIntentPublicUrl(params.competitionId, rawToken);
  const deadlineLabel = formatDeadlineLabel(params.responseDeadlineAt);
  const now = new Date();

  await sendUnpaidEntryIntentEmail({
    to: params.target.email,
    competitionName: params.competitionName,
    participantName: params.target.fullName,
    responseDeadlineLabel: deadlineLabel,
    intentUrl,
  });

  await prisma.competitionEntryPaymentIntentToken.update({
    where: { id: params.tokenId },
    data: {
      tokenHash,
      emailDeliveredAt: now,
      lastEmailSentAt: now,
    },
  });
}

/**
 * 初回一括送信（キャンペーン新規作成）。メール失敗時はトークン行を削除する。
 */
export async function runInitialUnpaidIntentBulkSend(
  prisma: PrismaClient,
  params: {
    competitionId: string;
    competitionName: string;
    responseDeadlineAt: Date;
    sentByUserId: string;
    targets: UnpaidIntentEmailTarget[];
  }
): Promise<IntentEmailSendResult & { campaignId: string }> {
  const sentAt = new Date();
  const expiresAt = computePaymentIntentTokenExpiresAt(params.responseDeadlineAt);

  const campaign = await prisma.competitionUnpaidEntryIntentCampaign.create({
    data: {
      competitionId: params.competitionId,
      responseDeadlineAt: params.responseDeadlineAt,
      sentAt,
      sentByUserId: params.sentByUserId,
    },
  });

  let sentCount = 0;
  let failedCount = 0;
  const failures: { entryId: string; error: string }[] = [];

  for (let i = 0; i < params.targets.length; i++) {
    const target = params.targets[i]!;
    if (i > 0) await sleep(RESEND_SEND_INTERVAL_MS);
    const token = await prisma.competitionEntryPaymentIntentToken.create({
      data: {
        campaignId: campaign.id,
        entryId: target.entryId,
        tokenHash: hashPaymentIntentToken(generatePaymentIntentRawToken()),
        expiresAt,
      },
    });

    try {
      await deliverIntentEmail(prisma, {
        tokenId: token.id,
        competitionId: params.competitionId,
        competitionName: params.competitionName,
        responseDeadlineAt: params.responseDeadlineAt,
        target,
      });
      sentCount += 1;
    } catch (err) {
      failedCount += 1;
      failures.push({
        entryId: target.entryId,
        error: err instanceof Error ? err.message : "送信失敗",
      });
      await prisma.competitionEntryPaymentIntentToken.delete({ where: { id: token.id } });
    }
  }

  return {
    campaignId: campaign.id,
    sentCount,
    failedCount,
    skippedNotTarget: 0,
    failures,
  };
}

/**
 * 既存キャンペーンで未達メールを再送（トークン hash 更新）。
 */
export async function resendUndeliveredUnpaidIntentEmails(
  prisma: PrismaClient,
  params: {
    campaignId: string;
    competitionId: string;
    competitionName: string;
    responseDeadlineAt: Date;
  }
): Promise<IntentEmailSendResult> {
  const targetByEntryId = new Map(
    (await listUnpaidIntentEmailTargets(prisma, params.competitionId)).targets.map((t) => [
      t.entryId,
      t,
    ])
  );

  const tokens = await prisma.competitionEntryPaymentIntentToken.findMany({
    where: {
      campaignId: params.campaignId,
      emailDeliveredAt: null,
      respondedAt: null,
    },
    select: { id: true, entryId: true },
  });

  let sentCount = 0;
  let failedCount = 0;
  let skippedNotTarget = 0;
  const failures: { entryId: string; error: string }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (i > 0) await sleep(RESEND_SEND_INTERVAL_MS);
    const target = targetByEntryId.get(token.entryId);
    if (!target) {
      skippedNotTarget += 1;
      continue;
    }

    try {
      await deliverIntentEmail(prisma, {
        tokenId: token.id,
        competitionId: params.competitionId,
        competitionName: params.competitionName,
        responseDeadlineAt: params.responseDeadlineAt,
        target,
      });
      sentCount += 1;
    } catch (err) {
      failedCount += 1;
      failures.push({
        entryId: token.entryId,
        error: err instanceof Error ? err.message : "送信失敗",
      });
    }
  }

  return { sentCount, failedCount, skippedNotTarget, failures };
}

/** 新規対象へトークン追加して送信（キャンペーン既存・一括送信後の漏れ） */
export async function sendUnpaidIntentToNewTargets(
  prisma: PrismaClient,
  params: {
    campaignId: string;
    competitionId: string;
    competitionName: string;
    responseDeadlineAt: Date;
  }
): Promise<IntentEmailSendResult> {
  const existingEntryIds = new Set(
    (
      await prisma.competitionEntryPaymentIntentToken.findMany({
        where: { campaignId: params.campaignId },
        select: { entryId: true },
      })
    ).map((t) => t.entryId)
  );

  const { targets } = await listUnpaidIntentEmailTargets(prisma, params.competitionId);
  const newTargets = targets.filter((t) => !existingEntryIds.has(t.entryId));
  const expiresAt = computePaymentIntentTokenExpiresAt(params.responseDeadlineAt);

  let sentCount = 0;
  let failedCount = 0;
  const failures: { entryId: string; error: string }[] = [];

  for (let i = 0; i < newTargets.length; i++) {
    const target = newTargets[i]!;
    if (i > 0) await sleep(RESEND_SEND_INTERVAL_MS);
    const token = await prisma.competitionEntryPaymentIntentToken.create({
      data: {
        campaignId: params.campaignId,
        entryId: target.entryId,
        tokenHash: hashPaymentIntentToken(generatePaymentIntentRawToken()),
        expiresAt,
      },
    });

    try {
      await deliverIntentEmail(prisma, {
        tokenId: token.id,
        competitionId: params.competitionId,
        competitionName: params.competitionName,
        responseDeadlineAt: params.responseDeadlineAt,
        target,
      });
      sentCount += 1;
    } catch (err) {
      failedCount += 1;
      failures.push({
        entryId: target.entryId,
        error: err instanceof Error ? err.message : "送信失敗",
      });
      await prisma.competitionEntryPaymentIntentToken.delete({ where: { id: token.id } });
    }
  }

  return { sentCount, failedCount, skippedNotTarget: 0, failures };
}
