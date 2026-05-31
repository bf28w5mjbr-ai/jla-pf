/**
 * 誤った realign のロールバック（オープン女子ビーチスプリント HEAT）。
 * realign-official-result-heats-to-snapshot 実行前の heat/lane に戻す。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/rollback-open-women-beach-sprint-heat-realign.ts --execute
 */
import { prisma } from "@/server/db";

const OFFICIAL_RESULT_ID = "cmprq9sjb000ljj04b016uxyd";

/** entryId → { heat, lane } before realign */
const RESTORE: Record<string, { heat: number; lane: number }> = {
  cmol5sipr0001js042jnjvtk4: { heat: 1, lane: 3 },
  cmozl99mt001cla045m4sa5p0: { heat: 1, lane: 2 },
  cmoth5j17000fl704ezecu0pv: { heat: 1, lane: 7 },
  cmoknujei000jlb045yra5xif: { heat: 1, lane: 4 },
  cmor0asw8000gl8047vjqfy5h: { heat: 1, lane: 6 },
  cmorq93420007l504q70b81at: { heat: 1, lane: 5 },
  cmo2uhah90001la04dasdccfl: { heat: 2, lane: 7 },
  cmojs5gu00002js043ctro2he: { heat: 2, lane: 3 },
  cmol8otte0005kz049yu00yvf: { heat: 2, lane: 2 },
  cmosjjiql000iks04bf1ap7ts: { heat: 2, lane: 4 },
  cmotd15p60001ju04o9zy0a1x: { heat: 2, lane: 8 },
  cmoo3t8j0000elc042yeoiaiw: { heat: 2, lane: 1 },
  cmou21ysw0002l404wudu2rxn: { heat: 2, lane: 6 },
  cmoy94o7c0003kw04p68p2k6m: { heat: 3, lane: 3 },
  cmoo1tc2j0001l104c4znilep: { heat: 3, lane: 2 },
  cmot2t6420005lb04wy1afncz: { heat: 3, lane: 4 },
  cmoiizj4q000blb046t6qwkjq: { heat: 3, lane: 1 },
  cmomkdqdy0001ib04kks6ts78: { heat: 3, lane: 6 },
};

const execute = process.argv.includes("--execute");

async function main() {
  const rows = await prisma.officialResultRow.findMany({
    where: { officialResultId: OFFICIAL_RESULT_ID },
    select: { id: true, competitionEntryId: true, heat: true, lane: true, rank: true },
  });

  const updates = rows.filter(
    (r) => r.competitionEntryId && RESTORE[r.competitionEntryId]
  );

  for (const row of updates) {
    const target = RESTORE[row.competitionEntryId!]!;
    console.log(
      `entry ${row.competitionEntryId} rank ${row.rank}: heat ${row.heat} lane ${row.lane} → heat ${target.heat} lane ${target.lane}`
    );
  }

  if (!execute) {
    console.log("\n[dry-run]");
    return;
  }

  await prisma.$transaction(
    updates.map((row) =>
      prisma.officialResultRow.update({
        where: { id: row.id },
        data: RESTORE[row.competitionEntryId!]!,
      })
    )
  );
  console.log("\n[execute] restored", updates.length, "rows");
}

main().finally(() => prisma.$disconnect());
