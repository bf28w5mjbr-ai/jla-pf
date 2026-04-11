/**
 * ageCategoryId 付きの Event.name を、buildStoredCompetitionEventName と同じ形式に揃える（既存データのバックフィル）。
 * 男女ペアなど同一 sibling グループは updateMany で一度に更新する。
 *
 * Usage:
 *   pnpm backfill:event-stored-names
 *   pnpm backfill:event-stored-names -- --dry-run
 */
import { prisma } from "@/server/db";
import {
  buildStoredCompetitionEventName,
  extractTabInnerCompetitionEventName,
} from "@/lib/competitionEventStoredName";
import { eventSiblingGroupWhere } from "@/lib/eventSiblingGroup";

function parseArgs() {
  const argv = process.argv.slice(2);
  let dryRun = false;
  for (const a of argv) {
    if (a === "--") continue;
    if (a === "--dry-run") dryRun = true;
  }
  return { dryRun };
}

async function main() {
  const { dryRun } = parseArgs();

  const events = await prisma.event.findMany({
    where: { ageCategoryId: { not: null } },
    include: { ageCategory: true },
    orderBy: [{ competitionId: "asc" }, { name: "asc" }],
  });

  type Row = (typeof events)[number];
  const groupKey = (ev: Row) =>
    `${ev.competitionId}\t${ev.name}\t${ev.type}\t${ev.category}\t${ev.ageCategoryId}`;

  const seen = new Set<string>();
  let updatedGroups = 0;
  let skippedGroups = 0;

  for (const ev of events) {
    const gk = groupKey(ev);
    if (seen.has(gk)) continue;
    seen.add(gk);

    const catName = ev.ageCategory?.name;
    const ageId = ev.ageCategoryId;
    if (!ageId || !catName?.trim()) {
      skippedGroups += 1;
      continue;
    }

    const inner = extractTabInnerCompetitionEventName(ev.name, catName);
    const newName = buildStoredCompetitionEventName({
      tabInnerName: inner,
      ageCategoryId: ageId,
      ageCategoryName: catName,
    });

    if (!newName || newName === ev.name) {
      skippedGroups += 1;
      continue;
    }

    const where = eventSiblingGroupWhere(ev.competitionId, {
      name: ev.name,
      type: ev.type,
      category: ev.category,
      ageCategoryId: ageId,
    });

    if (dryRun) {
      console.log(
        `[dry-run] ${ev.competitionId} | ${JSON.stringify(ev.name)} -> ${JSON.stringify(newName)}`
      );
    } else {
      const r = await prisma.event.updateMany({ where, data: { name: newName } });
      console.log(
        `updated ${r.count} row(s) | ${ev.competitionId} | ${JSON.stringify(ev.name)} -> ${JSON.stringify(newName)}`
      );
    }
    updatedGroups += 1;
  }

  console.log(
    dryRun
      ? `[dry-run] groups to update: ${updatedGroups}, skipped: ${skippedGroups}`
      : `done. updated groups: ${updatedGroups}, skipped: ${skippedGroups}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
