/**
 * 第28回神奈川の未決済出場意思メールを再送（CLI）。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/resend-unpaid-intent-kanagawa28.ts
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/resend-unpaid-intent-kanagawa28.ts --dry-run
 */
import { prisma } from "../src/server/db";
import {
  resendUndeliveredUnpaidIntentEmails,
  sendUnpaidIntentToNewTargets,
} from "../src/lib/unpaidEntryIntentCampaignSend";

const COMPETITION_NAME = "第28回神奈川県ライフセービング選手権大会";
const NAME_FALLBACK = "第28回神奈川県ライフセービング選手権";

const dryRun = process.argv.includes("--dry-run");

function futureDeadline(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(23, 0, 0, 0);
  return d;
}

async function main() {
  let comp = await prisma.competition.findFirst({
    where: { name: COMPETITION_NAME },
    select: { id: true, name: true },
  });
  if (!comp) {
    comp = await prisma.competition.findFirst({
      where: { name: { contains: NAME_FALLBACK } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    });
  }
  if (!comp) {
    console.error("大会が見つかりません");
    process.exit(1);
  }

  const campaign = await prisma.competitionUnpaidEntryIntentCampaign.findFirst({
    where: { competitionId: comp.id },
    orderBy: { sentAt: "desc" },
  });
  if (!campaign) {
    console.error("キャンペーンがありません");
    process.exit(1);
  }

  const undelivered = await prisma.competitionEntryPaymentIntentToken.count({
    where: { campaignId: campaign.id, emailDeliveredAt: null, respondedAt: null },
  });

  const newDeadline = futureDeadline();
  console.log(`大会: ${comp.name}`);
  console.log(`キャンペーン: ${campaign.id}`);
  console.log(`未達トークン: ${undelivered}`);
  console.log(`新しい回答期限: ${newDeadline.toISOString()}`);

  if (dryRun) {
    console.log("--dry-run のため送信しません");
    return;
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.error("RESEND_API_KEY が未設定です");
    process.exit(1);
  }

  const { resolveTransactionalEmailFrom, isResendOnboardingFrom } = await import(
    "../src/lib/email/resendRegistrationOtp"
  );
  const from = resolveTransactionalEmailFrom();
  if (isResendOnboardingFrom(from)) {
    console.error(
      "送信元が Resend テスト用です。.env に EMAIL_FROM=検証済みドメイン（例: Bluvium <noreply@your-domain.com>）を設定してください。"
    );
    process.exit(1);
  }
  console.log("送信元:", from.replace(/<[^>]+>/, "<...>"));

  await prisma.competitionUnpaidEntryIntentCampaign.update({
    where: { id: campaign.id },
    data: { responseDeadlineAt: newDeadline },
  });

  const base = {
    campaignId: campaign.id,
    competitionId: comp.id,
    competitionName: comp.name,
    responseDeadlineAt: newDeadline,
  };

  const resend = await resendUndeliveredUnpaidIntentEmails(prisma, base);
  const added = await sendUnpaidIntentToNewTargets(prisma, base);

  console.log("再送結果:", resend);
  console.log("新規対象:", added);

  if (resend.sentCount + added.sentCount === 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
