/**
 * チーム種目のみの個人エントリーで、旧実装により totalFee=0 のまま SUBMITTED になっている行を是正する。
 * POST /entries の teamOnlyIntentWithoutItemSelection と同じ課金カウントで再計算し、totalFee を更新する。
 *
 * 併せて当該エントリーに紐づく Stripe Checkout 未完了（PENDING）の EntryCheckoutSession を EXPIRED にし、
 * ユーザーがエントリーページから新規 Checkout を作れるようにする（Stripe 上の Session は別途期限切れのことが多い）。
 *
 * Usage:
 *   pnpm backfill:team-only-zero-fee:dry
 *   pnpm backfill:team-only-zero-fee
 *
 * Options（process.argv）:
 *   --dry-run     更新しない（--apply が無いときはこれと同じ）
 *   --apply       DB を更新する（--dry-run と併記した場合は dry-run が優先）
 *   --competitionId=<cuid>  指定大会のみ
 *
 * 対象条件（API の teamOnlyIntentWithoutItemSelection + 未払いに整合）:
 * - status SUBMITTED, totalFee === 0, clubIndividualFeePaidAt が null
 * - EntryItem が 0 件
 * - スナップショット上 items / teamEntries がいずれも「有効行なし」かつ clubId（または entry.clubId）が非空
 * - 支払済み Checkout（COMPLETED / DISPUTED）が存在しない
 */
import { ENTRY_CHECKOUT_PAID_STATUSES } from "@/lib/entryCheckoutSessionPaid";
import type { CompetitionEntryFeeConfig } from "@/lib/entryFee";
import {
  computeTeamOnlyIntentPersonalEntryFee,
  isTeamOnlyIntentWithoutItemSelectionFromSnapshot,
} from "@/lib/teamOnlyIntentZeroFeeReconcile";
import { prisma } from "@/server/db";

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  let competitionId: string | null = null;
  for (const a of argv) {
    if (a === "--") continue;
    if (a.startsWith("--competitionId=")) {
      competitionId = a.slice("--competitionId=".length).trim() || null;
    }
  }
  return { dryRun, competitionId };
}

async function main() {
  const { dryRun, competitionId } = parseArgs();

  const entries = await prisma.competitionEntry.findMany({
    where: {
      status: "SUBMITTED",
      totalFee: 0,
      clubIndividualFeePaidAt: null,
      items: { none: {} },
      NOT: {
        checkoutSessions: {
          some: {
            status: { in: [...ENTRY_CHECKOUT_PAID_STATUSES] },
          },
        },
      },
      ...(competitionId ? { competitionId } : {}),
    },
    select: {
      id: true,
      competitionId: true,
      userId: true,
      clubId: true,
      totalFee: true,
      snapshot: { select: { data: true } },
      checkoutSessions: {
        select: { id: true, status: true, stripeCheckoutSessionId: true },
      },
      competition: {
        select: {
          id: true,
          name: true,
          startDate: true,
          entryFee: true,
          ageCategories: {
            orderBy: { displayOrder: "asc" },
            select: {
              id: true,
              displayOrder: true,
              eligibleBirthDateFrom: true,
              eligibleBirthDateTo: true,
            },
          },
        },
      },
      user: {
        select: { dateOfBirth: true },
      },
    },
  });

  let teamOnlyIntentRows = 0;
  let wouldUpdate = 0;
  let skipNotIntent = 0;
  let skipZeroComputedFee = 0;
  const now = new Date();

  for (const row of entries) {
    const snap = row.snapshot?.data ?? null;
    if (!isTeamOnlyIntentWithoutItemSelectionFromSnapshot(row.clubId, snap)) {
      skipNotIntent += 1;
      continue;
    }

    teamOnlyIntentRows += 1;

    const userDob = row.user?.dateOfBirth ? new Date(row.user.dateOfBirth) : null;

    const nextFee = computeTeamOnlyIntentPersonalEntryFee({
      competitionStartDate: new Date(row.competition.startDate),
      entryFee: row.competition.entryFee as CompetitionEntryFeeConfig | number | null,
      ageCategories: row.competition.ageCategories.map((c) => ({
        id: c.id,
        displayOrder: c.displayOrder,
        eligibleBirthDateFrom: c.eligibleBirthDateFrom,
        eligibleBirthDateTo: c.eligibleBirthDateTo,
      })),
      userDateOfBirth: userDob,
    });

    const pendingSessions = row.checkoutSessions.filter((s) => s.status === "PENDING");

    console.log(
      `[${dryRun ? "dry-run" : "apply"}] entry=${row.id} competition=${row.competitionId} (${row.competition.name}) user=${row.userId} totalFee 0 -> ${nextFee} pendingCheckouts=${pendingSessions.length}`
    );

    if (nextFee <= 0) {
      console.warn(
        `  [skip] computed fee is ${nextFee} (無料大会・年齢帯未解決・等)。手動確認してください。`
      );
      skipZeroComputedFee += 1;
      continue;
    }

    wouldUpdate += 1;

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        if (pendingSessions.length > 0) {
          await tx.entryCheckoutSession.updateMany({
            where: {
              entryId: row.id,
              status: "PENDING",
            },
            data: {
              status: "EXPIRED",
              expiredAt: now,
            },
          });
        }
        await tx.competitionEntry.update({
          where: { id: row.id },
          data: { totalFee: nextFee },
        });
      });
    }
  }

  console.log(
    `\nSummary: scanned=${entries.length} teamOnlyIntentRows=${teamOnlyIntentRows} wouldUpdateOrUpdated=${wouldUpdate} skipNotIntent=${skipNotIntent} skipZeroComputedFee=${skipZeroComputedFee} mode=${dryRun ? "DRY-RUN" : "APPLIED"}`
  );

  if (dryRun && wouldUpdate > 0) {
    console.log("\nTo apply changes, run with --apply (omit --dry-run).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
