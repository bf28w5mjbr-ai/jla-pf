/**
 * 第28回神奈川：師岡 大周（湯河原LSC）を手動入金済みにする。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/mark-manual-payment-shigaoka-kanagawa28.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/mark-manual-payment-shigaoka-kanagawa28.ts --execute
 */
import { isEntryEstablished } from "../src/lib/entryFinalization";
import {
  canApproveOrganizerPostPay,
  canRecordOrganizerManualPayment,
  isEntryFeeSettled,
} from "../src/lib/entryOrganizerPostPay";
import { expirePendingEntryCheckoutSessions } from "../src/lib/entryOrganizerPostPayService";
import { prisma } from "../src/server/db";

const COMPETITION_NAME = "第28回神奈川県ライフセービング選手権大会";
const NAME_FALLBACK = "第28回神奈川県ライフセービング選手権";
const TARGET_FAMILY = "師岡";
const TARGET_GIVEN = "大周";
const TARGET_CLUB = "湯河原";
const MANUAL_NOTE = "主催確認：振込入金済み（CLI）";

const execute = process.argv.includes("--execute");
const dryRun = !execute;

async function findCompetition() {
  let comp = await prisma.competition.findFirst({
    where: { name: COMPETITION_NAME },
    select: { id: true, name: true },
  });
  if (!comp) {
    comp = await prisma.competition.findFirst({
      where: { name: { contains: NAME_FALLBACK } },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    });
  }
  return comp;
}

async function main() {
  const comp = await findCompetition();
  if (!comp) {
    console.error(`大会が見つかりません: ${COMPETITION_NAME}`);
    process.exit(1);
  }
  console.log(`大会: ${comp.name} (${comp.id})`);

  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: comp.id,
      user: {
        profile: {
          familyName: TARGET_FAMILY,
          givenName: TARGET_GIVEN,
        },
      },
    },
    select: {
      id: true,
      status: true,
      totalFee: true,
      organizerPostPayApprovedAt: true,
      organizerManualPaidAt: true,
      clubIndividualFeePaidAt: true,
      club: { select: { name: true } },
      checkoutSessions: { orderBy: { createdAt: "desc" }, select: { id: true, status: true } },
      user: {
        select: {
          email: true,
          profile: { select: { familyName: true, givenName: true } },
        },
      },
    },
  });

  const entry = entries.find((e) => (e.club?.name ?? "").includes(TARGET_CLUB));
  if (!entry) {
    console.error("該当エントリーが見つかりません。");
    console.log(
      "同名エントリー:",
      entries.map((e) => ({
        id: e.id,
        club: e.club?.name,
        email: e.user.email,
      }))
    );
    process.exit(1);
  }

  const name = `${entry.user.profile?.familyName ?? ""} ${entry.user.profile?.givenName ?? ""}`.trim();
  const like = {
    status: entry.status,
    totalFee: entry.totalFee,
    clubIndividualFeePaidAt: entry.clubIndividualFeePaidAt,
    organizerPostPayApprovedAt: entry.organizerPostPayApprovedAt,
    organizerManualPaidAt: entry.organizerManualPaidAt,
    checkoutSessions: entry.checkoutSessions,
  };

  console.log(`対象: ${name} / ${entry.club?.name} / ${entry.user.email}`);
  console.log(`entryId: ${entry.id}`);
  console.log(`totalFee: ${entry.totalFee}`);
  console.log(`established: ${isEntryEstablished(like)}`);
  console.log(`feeSettled: ${isEntryFeeSettled(like)}`);
  console.log(`postPayApprovedAt: ${entry.organizerPostPayApprovedAt?.toISOString() ?? "null"}`);
  console.log(`manualPaidAt: ${entry.organizerManualPaidAt?.toISOString() ?? "null"}`);

  if (isEntryFeeSettled(like)) {
    console.log("すでに決済完了です。変更は不要です。");
    return;
  }

  const needsApprove = canApproveOrganizerPostPay(like);
  const needsManual = canRecordOrganizerManualPayment(like);

  if (!needsApprove && !needsManual) {
    console.error("後払い承認・手動入金のいずれも実行できません。");
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n[dry-run] 実行予定:");
    if (needsApprove) console.log("  1. 後払い承認 (post-pay/approve)");
    if (needsManual || needsApprove) console.log("  2. 手動入金記録 (manual-payment)");
    console.log("\n本番実行: --execute を付けて再実行");
    return;
  }

  const now = new Date();

  if (needsApprove) {
    await prisma.$transaction(async (tx) => {
      await tx.competitionEntry.update({
        where: { id: entry.id },
        data: {
          organizerPostPayApprovedAt: now,
          organizerPostPayApprovedByUserId: null,
        },
      });
      await expirePendingEntryCheckoutSessions(tx, entry.id);
    });
    console.log("後払い承認を記録しました。");
  }

  const refreshed = await prisma.competitionEntry.findUniqueOrThrow({
    where: { id: entry.id },
    select: {
      status: true,
      totalFee: true,
      clubIndividualFeePaidAt: true,
      organizerPostPayApprovedAt: true,
      organizerManualPaidAt: true,
      checkoutSessions: { select: { status: true } },
    },
  });

  const refreshedLike = {
    status: refreshed.status,
    totalFee: refreshed.totalFee,
    clubIndividualFeePaidAt: refreshed.clubIndividualFeePaidAt,
    organizerPostPayApprovedAt: refreshed.organizerPostPayApprovedAt,
    organizerManualPaidAt: refreshed.organizerManualPaidAt,
    checkoutSessions: refreshed.checkoutSessions,
  };

  if (!canRecordOrganizerManualPayment(refreshedLike)) {
    console.error("手動入金を記録できません（状態が想定外）。");
    process.exit(1);
  }

  const expired = await prisma.$transaction(async (tx) => {
    await tx.competitionEntry.update({
      where: { id: entry.id },
      data: {
        organizerManualPaidAt: now,
        organizerManualPaidByUserId: null,
        organizerManualPaidNote: MANUAL_NOTE,
      },
    });
    return expirePendingEntryCheckoutSessions(tx, entry.id);
  });

  console.log(`手動入金を記録しました（期限切れCheckout: ${expired}件）。`);
  console.log("feeSettled:", isEntryFeeSettled({ ...refreshedLike, organizerManualPaidAt: now }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
