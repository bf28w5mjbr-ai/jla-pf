/**
 * CompetitionEntry.clubId が NULL だが EntrySnapshot.data に clubId が入っている行を、
 * スナップショットの値で復元する（クラブページの個人エントリー表示・TO 件数に反映させる）。
 * クラブの存在と、当該ユーザーがそのクラブの承認済みメンバーであることを確認してから更新する。
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/backfill-competition-entry-club-id-from-snapshot.ts --dry-run [--clubId=<cuid>]
 *
 * --clubId を省略すると全クラブ対象（スナップショットの clubId が一致する行のみ更新）。
 */
import { extractClubIdFromEntrySnapshotData } from "@/lib/entrySnapshotClubId";
import { prisma } from "@/server/db";

function parseArgs() {
  let dryRun = false;
  let onlyClubId: string | null = null;
  for (const a of process.argv.slice(2)) {
    if (a === "--") continue;
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--clubId=")) onlyClubId = a.slice("--clubId=".length).trim() || null;
  }
  return { dryRun, onlyClubId };
}

async function main() {
  const { dryRun, onlyClubId } = parseArgs();

  const entries = await prisma.competitionEntry.findMany({
    where: {
      clubId: null,
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      userId: true,
      competitionId: true,
      snapshot: { select: { data: true } },
    },
  });

  let applied = 0;
  let skipped = 0;

  for (const e of entries) {
    const snapClubId = extractClubIdFromEntrySnapshotData(e.snapshot?.data);
    if (!snapClubId) {
      skipped += 1;
      continue;
    }
    if (onlyClubId && snapClubId !== onlyClubId) {
      skipped += 1;
      continue;
    }

    const club = await prisma.club.findUnique({
      where: { id: snapClubId },
      select: { id: true },
    });
    if (!club) {
      skipped += 1;
      console.warn(
        `[skip] entry ${e.id} snapshot clubId=${snapClubId} — club not found`
      );
      continue;
    }

    const membership = await prisma.membership.findFirst({
      where: {
        clubId: snapClubId,
        userId: e.userId,
        status: "APPROVED",
      },
      select: { id: true },
    });
    if (!membership) {
      skipped += 1;
      console.warn(
        `[skip] entry ${e.id} user=${e.userId} snapshot clubId=${snapClubId} — no approved membership`
      );
      continue;
    }

    if (dryRun) {
      console.log(
        `[dry-run] would set clubId=${snapClubId} on entry ${e.id} (competition=${e.competitionId} user=${e.userId})`
      );
    } else {
      await prisma.competitionEntry.update({
        where: { id: e.id },
        data: { clubId: snapClubId },
      });
    }
    applied += 1;
  }

  console.log(
    dryRun
      ? `Done (dry-run). Would apply ${applied}, skipped ${skipped} (no snapshot club / filter / club missing / no membership).`
      : `Done. Applied ${applied}, skipped ${skipped}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
