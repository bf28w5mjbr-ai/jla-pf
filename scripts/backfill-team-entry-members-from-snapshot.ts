/**
 * スナップショット JSON の members[] から TeamEntryMember を復元する（明示実行用）。
 *
 * 用法:
 *   pnpm exec tsx scripts/backfill-team-entry-members-from-snapshot.ts <competitionId> [eventId]
 */
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { backfillTeamEntryMembersFromSnapshotIfEmpty } from "@/lib/teamEntryMemberSnapshotBackfill";
import { prisma } from "@/server/db";

async function main() {
  const competitionId = process.argv[2]?.trim();
  const eventIdFilter = process.argv[3]?.trim();

  if (!competitionId) {
    console.error(
      "Usage: pnpm exec tsx scripts/backfill-team-entry-members-from-snapshot.ts <competitionId> [eventId]"
    );
    process.exit(1);
  }

  const snapshot = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId },
    select: { data: true },
  });

  if (!snapshot?.data) {
    console.error("No start list snapshot for competition:", competitionId);
    process.exit(1);
  }

  const events = await prisma.event.findMany({
    where: {
      competitionId,
      type: "TEAM",
      ...(eventIdFilter ? { id: eventIdFilter } : {}),
    },
    select: { id: true, name: true },
    orderBy: { displayOrder: "asc" },
  });

  if (events.length === 0) {
    console.log("No TEAM events to backfill.");
    return;
  }

  let totalCreated = 0;
  for (const event of events) {
    const frozenSnapshotRounds = extractFrozenRoundsForEventFromSnapshotData(
      snapshot.data,
      event.id
    );
    if (!frozenSnapshotRounds?.length) {
      console.log(`[skip] ${event.name}: no frozen rounds in snapshot`);
      continue;
    }
    const created = await backfillTeamEntryMembersFromSnapshotIfEmpty(prisma, {
      competitionId,
      eventId: event.id,
      frozenSnapshotRounds,
    });
    console.log(`[done] ${event.name}: created ${created} member row(s)`);
    totalCreated += created;
  }

  console.log(`\nTotal created: ${totalCreated}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
