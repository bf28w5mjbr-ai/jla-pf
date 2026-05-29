/**
 * クラブ先払い個人枠: Payment SUCCEEDED だが先払い枠・エントリー未反映のギャップを修復する。
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env \
 *     scripts/reconcile-club-prepaid-stripe-side-effects.ts --dry-run
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env \
 *     scripts/reconcile-club-prepaid-stripe-side-effects.ts --execute --payment-id=PAYMENT_ID
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env \
 *     scripts/reconcile-club-prepaid-stripe-side-effects.ts --execute --scan-all
 *
 *   pnpm exec tsx ... --execute --payment-id=... --regenerate-start-list --competition-id=COMP_ID
 *
 * --dry-run / --execute: いずれか必須（同時指定不可）
 * --payment-id: 単一 Payment を対象
 * --scan-all: SUCCEEDED かつ shouldApplyClubPrepaid な全 Payment でギャップ検出
 * --regenerate-start-list: 修復後に replaceCompetitionStartListSnapshot（--competition-id 必須）
 */
import { PrismaClient } from "@prisma/client";
import {
  applyClubTeamAndPrepaidStripeSideEffects,
  parseClubPrepaidPaymentMetadata,
} from "@/lib/clubPrepaidIndividualSlots";
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { isEntryEstablished } from "@/lib/entryFinalization";
import { getIndividualEntryPaymentStatusLabel } from "@/lib/entryWithdrawalAdminLabel";
import { replaceCompetitionStartListSnapshot } from "@/lib/startListSnapshot";
import { shouldApplyClubPrepaidStripeSideEffects } from "@/lib/teamEntryPayments";
import { datasourceUrlForScripts } from "@/server/db";

const ENTRY_CHECKOUT_PAID = ["COMPLETED", "DISPUTED"] as const;

type ParsedArgs = {
  mode: "dry-run" | "execute";
  paymentId: string | null;
  scanAll: boolean;
  regenerateStartList: boolean;
  competitionId: string | null;
};

function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);
  let hasDry = false;
  let hasExecute = false;
  let paymentId: string | null = null;
  let scanAll = false;
  let regenerateStartList = false;
  let competitionId: string | null = null;

  for (const a of argv) {
    if (a === "--dry-run") hasDry = true;
    else if (a === "--execute") hasExecute = true;
    else if (a === "--scan-all") scanAll = true;
    else if (a === "--regenerate-start-list") regenerateStartList = true;
    else if (a.startsWith("--payment-id=")) {
      paymentId = a.slice("--payment-id=".length).trim() || null;
    } else if (a.startsWith("--competition-id=")) {
      competitionId = a.slice("--competition-id=".length).trim() || null;
    }
  }

  if (hasDry && hasExecute) {
    console.error("エラー: --dry-run と --execute は同時に指定できません。");
    process.exit(1);
  }
  if (!hasDry && !hasExecute) {
    console.error("エラー: --dry-run または --execute を指定してください。");
    process.exit(1);
  }
  if (!paymentId && !scanAll) {
    console.error("エラー: --payment-id または --scan-all を指定してください。");
    process.exit(1);
  }
  if (paymentId && scanAll) {
    console.error("エラー: --payment-id と --scan-all は同時に指定できません。");
    process.exit(1);
  }
  if (regenerateStartList && !competitionId) {
    console.error("エラー: --regenerate-start-list には --competition-id が必要です。");
    process.exit(1);
  }

  return {
    mode: hasExecute ? "execute" : "dry-run",
    paymentId,
    scanAll,
    regenerateStartList,
    competitionId,
  };
}

function createPrisma(): PrismaClient {
  const url = datasourceUrlForScripts();
  if (!url) {
    throw new Error("DATABASE_URL または DATABASE_URL_UNPOOLED を .env に設定してください。");
  }
  return new PrismaClient({
    datasourceUrl: url,
    log: ["error", "warn"],
  });
}

type PaymentRow = {
  id: string;
  status: string;
  amount: number;
  paidAt: Date | null;
  ownerId: string;
  metadata: unknown;
};

type GapReport = {
  payment: PaymentRow;
  clubName: string | null;
  competitionName: string | null;
  pendingSlotCount: number;
  activeUnreconciledUserIds: string[];
  slotSummary: { coveredUserId: string; status: string; consumedByEntryId: string | null }[];
  entryRows: {
    userId: string;
    name: string;
    totalFee: number;
    paymentLabel: string;
    established: boolean;
  }[];
};

async function loadPayments(prisma: PrismaClient, paymentId: string | null): Promise<PaymentRow[]> {
  if (paymentId) {
    const p = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        amount: true,
        paidAt: true,
        ownerId: true,
        metadata: true,
        type: true,
      },
    });
    if (!p) {
      console.error(`Payment が見つかりません: ${paymentId}`);
      process.exit(1);
    }
    if (p.type !== "COMPETITION_ENTRY_FEE" || p.status !== "SUCCEEDED") {
      console.error(
        `Payment は SUCCEEDED の COMPETITION_ENTRY_FEE である必要があります（現在: type=${p.type} status=${p.status}）`
      );
      process.exit(1);
    }
    if (!shouldApplyClubPrepaidStripeSideEffects(p)) {
      console.error("この Payment はクラブ先払い side effects の対象外です。");
      process.exit(1);
    }
    return [p];
  }

  const all = await prisma.payment.findMany({
    where: { type: "COMPETITION_ENTRY_FEE", status: "SUCCEEDED", ownerType: "CLUB" },
    select: {
      id: true,
      status: true,
      amount: true,
      paidAt: true,
      ownerId: true,
      metadata: true,
      type: true,
    },
    orderBy: { paidAt: "asc" },
  });
  return all.filter((p) => shouldApplyClubPrepaidStripeSideEffects(p));
}

async function buildGapReport(prisma: PrismaClient, payment: PaymentRow): Promise<GapReport | null> {
  const ids = parseClubPrepaidPaymentMetadata(payment.metadata);
  if (!ids) {
    console.warn(`  [skip] payment ${payment.id}: metadata に clubId/competitionId がありません`);
    return null;
  }

  const [club, competition] = await Promise.all([
    prisma.club.findUnique({ where: { id: ids.clubId }, select: { name: true } }),
    prisma.competition.findUnique({ where: { id: ids.competitionId }, select: { name: true } }),
  ]);

  const slots = await prisma.clubCompetitionPrepaidIndividualSlot.findMany({
    where: { clubPaymentId: payment.id },
    select: {
      coveredUserId: true,
      status: true,
      consumedByEntryId: true,
    },
  });

  const pendingSlotCount = slots.filter((s) => s.status === "PENDING_CLUB_CHECKOUT").length;

  const activeSlots = slots.filter(
    (s) => s.status === "ACTIVE_WAIVER" && s.consumedByEntryId === null
  );
  const activeUserIds = [...new Set(activeSlots.map((s) => s.coveredUserId))];

  const coveredUserIds = [...new Set(slots.map((s) => s.coveredUserId))];
  const entries =
    coveredUserIds.length > 0
      ? await prisma.competitionEntry.findMany({
          where: {
            competitionId: ids.competitionId,
            clubId: ids.clubId,
            userId: { in: coveredUserIds },
            status: "SUBMITTED",
          },
          select: {
            userId: true,
            totalFee: true,
            status: true,
            clubIndividualFeePaidAt: true,
            organizerManualPaidAt: true,
            organizerPostPayApprovedAt: true,
            checkoutSessions: { select: { status: true, payload: true } },
            user: {
              select: {
                profile: { select: { familyName: true, givenName: true } },
              },
            },
          },
        })
      : [];

  const activeUnreconciledUserIds: string[] = [];
  for (const uid of activeUserIds) {
    const entry = entries.find((e) => e.userId === uid);
    if (!entry) continue;
    const hasPaidCheckout = entry.checkoutSessions.some((s) =>
      ENTRY_CHECKOUT_PAID.includes(s.status as (typeof ENTRY_CHECKOUT_PAID)[number])
    );
    if (entry.totalFee > 0 && !entry.clubIndividualFeePaidAt && !hasPaidCheckout) {
      activeUnreconciledUserIds.push(uid);
    }
  }

  const hasGap = pendingSlotCount > 0 || activeUnreconciledUserIds.length > 0;
  if (!hasGap) return null;

  const entryRows = entries.map((e) => {
    const name = [e.user.profile?.familyName, e.user.profile?.givenName]
      .filter(Boolean)
      .join(" ");
    const like = {
      status: e.status,
      totalFee: e.totalFee,
      checkoutSessions: e.checkoutSessions,
      clubIndividualFeePaidAt: e.clubIndividualFeePaidAt,
      organizerManualPaidAt: e.organizerManualPaidAt,
      organizerPostPayApprovedAt: e.organizerPostPayApprovedAt,
    };
    return {
      userId: e.userId,
      name: name || e.userId,
      totalFee: e.totalFee,
      paymentLabel: getIndividualEntryPaymentStatusLabel(like),
      established: isEntryEstablished(like),
    };
  });

  return {
    payment,
    clubName: club?.name ?? null,
    competitionName: competition?.name ?? null,
    pendingSlotCount,
    activeUnreconciledUserIds,
    slotSummary: slots.map((s) => ({
      coveredUserId: s.coveredUserId,
      status: s.status,
      consumedByEntryId: s.consumedByEntryId,
    })),
    entryRows,
  };
}

async function countEligibleEntries(prisma: PrismaClient, competitionId: string): Promise<number> {
  return prisma.competitionEntry.count({
    where: {
      competitionId,
      status: "SUBMITTED",
      ...competitionEntryEligibleForStartListWhere,
    },
  });
}

function printReport(report: GapReport, prefix: string): void {
  console.log(`${prefix} Payment ${report.payment.id}`);
  console.log(
    `  クラブ: ${report.clubName ?? "?"} / 大会: ${report.competitionName ?? "?"} / 金額: ${report.payment.amount}円 / paidAt: ${report.payment.paidAt?.toISOString() ?? "—"}`
  );
  console.log(
    `  枠: PENDING=${report.pendingSlotCount} ACTIVE未相殺=${report.activeUnreconciledUserIds.length}`
  );
  for (const s of report.slotSummary) {
    console.log(
      `    slot user=${s.coveredUserId} status=${s.status} consumed=${s.consumedByEntryId ?? "—"}`
    );
  }
  for (const e of report.entryRows) {
    console.log(
      `    entry ${e.name} totalFee=${e.totalFee} label=${e.paymentLabel} established=${e.established}`
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const prisma = createPrisma();

  try {
    const payments = await loadPayments(prisma, args.paymentId);
    console.log(`対象 Payment: ${payments.length} 件（mode=${args.mode}）`);

    const gaps: GapReport[] = [];
    for (const payment of payments) {
      const report = await buildGapReport(prisma, payment);
      if (report) gaps.push(report);
    }

    if (gaps.length === 0) {
      console.log("ギャップは検出されませんでした。");
    } else {
      console.log(`\nギャップ検出: ${gaps.length} 件\n`);
      for (const g of gaps) printReport(g, "[gap]");
    }

    if (args.mode === "dry-run") {
      if (args.regenerateStartList && args.competitionId) {
        const eligible = await countEligibleEntries(prisma, args.competitionId);
        console.log(
          `\n[dry-run] スタートリスト再生成対象大会 ${args.competitionId}: eligible entries=${eligible}`
        );
        console.log(
          "  チーム種目は TeamEntryMember 未割当のためチーム枠には載りません（個人種目のみ）。"
        );
      }
      return;
    }

    for (const g of gaps) {
      console.log(`\n[execute] applyClubTeamAndPrepaidStripeSideEffects(${g.payment.id})`);
      await applyClubTeamAndPrepaidStripeSideEffects(prisma, g.payment.id);
      const after = await buildGapReport(prisma, g.payment);
      if (after) {
        printReport(after, "[after — まだギャップあり]");
        console.error(`警告: Payment ${g.payment.id} の修復後もギャップが残っています。`);
      } else {
        console.log(`[after] Payment ${g.payment.id}: ギャップ解消`);
        const refreshed = await prisma.clubCompetitionPrepaidIndividualSlot.findMany({
          where: { clubPaymentId: g.payment.id },
          select: { coveredUserId: true, status: true, consumedByEntryId: true },
        });
        for (const s of refreshed) {
          console.log(`  slot user=${s.coveredUserId} status=${s.status} consumed=${s.consumedByEntryId ?? "—"}`);
        }
      }
    }

    if (args.regenerateStartList && args.competitionId) {
      const compId = args.competitionId;
      const before = await countEligibleEntries(prisma, compId);
      console.log(`\n[execute] replaceCompetitionStartListSnapshot(${compId}) eligible before=${before}`);
      const result = await replaceCompetitionStartListSnapshot({
        competitionId: compId,
        createdByUserId: undefined,
      });
      const after = await countEligibleEntries(prisma, compId);
      console.log(
        `  snapshotId=${result.snapshotId} wasUpdate=${result.wasUpdate} skipped=${result.skipped ?? false} eligible after=${after}`
      );
      console.log("  チーム種目はメンバー未割当のためスタートリストに載りません。");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
