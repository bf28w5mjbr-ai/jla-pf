/**
 * 第28回神奈川：オープン女子ビーチスプリント予選 ヒート1
 * 1位（石塚）↔ 2位（石黒）の順位を入れ替え。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-women-beach-sprint-heat1-swap-ranks.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-women-beach-sprint-heat1-swap-ranks.ts --execute
 */
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0009jr044y4c7616";
const ROUND = "HEAT" as const;
const HEAT = 1;
const RANK_A = 1;
const RANK_B = 2;

/** 現状1位 → 2位に */
const FAMILY_NAME_RANK1 = "石塚";
/** 現状2位 → 1位に */
const FAMILY_NAME_RANK2 = "石黒";

const execute = process.argv.includes("--execute");
const dryRun = !execute;

function displayName(row: {
  competitionEntry?: {
    user: { profile: { familyName: string | null; givenName: string | null } | null };
  } | null;
}): string {
  const p = row.competitionEntry?.user.profile;
  return p ? `${p.familyName ?? ""} ${p.givenName ?? ""}`.trim() : "?";
}

async function main() {
  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: {
        competitionId: COMPETITION_ID,
        eventId: EVENT_ID,
        round: ROUND,
      },
    },
    select: {
      id: true,
      lockedAt: true,
      rows: {
        where: { heat: HEAT, rank: { in: [RANK_A, RANK_B] } },
        select: {
          id: true,
          heat: true,
          lane: true,
          rank: true,
          competitionEntryId: true,
          competitionEntry: {
            select: {
              user: { select: { profile: { select: { familyName: true, givenName: true } } } },
            },
          },
        },
      },
      heatConfirmations: { where: { heat: HEAT }, select: { heat: true, confirmedAt: true } },
    },
  });

  if (!official) {
    console.error("OfficialResult not found");
    process.exit(1);
  }
  if (official.lockedAt) {
    console.warn("OfficialResult is locked — admin patch continues");
  }

  const rowRank1 = official.rows.find((r) => r.rank === RANK_A);
  const rowRank2 = official.rows.find((r) => r.rank === RANK_B);

  console.log("officialResultId:", official.id);
  console.log("heat confirmed:", official.heatConfirmations);

  console.log("\ncurrent:");
  console.log(`  rank ${RANK_A}:`, displayName(rowRank1 ?? {}), rowRank1?.competitionEntryId);
  console.log(`  rank ${RANK_B}:`, displayName(rowRank2 ?? {}), rowRank2?.competitionEntryId);

  if (!rowRank1 || !rowRank2) {
    console.error(`heat ${HEAT} rank ${RANK_A}/${RANK_B} rows not found — abort`);
    process.exit(1);
  }

  const name1 = rowRank1.competitionEntry?.user.profile?.familyName ?? "";
  const name2 = rowRank2.competitionEntry?.user.profile?.familyName ?? "";

  if (name1 !== FAMILY_NAME_RANK1) {
    console.error(`rank ${RANK_A} is not ${FAMILY_NAME_RANK1} (got ${name1}) — abort for safety`);
    process.exit(1);
  }
  if (name2 !== FAMILY_NAME_RANK2) {
    console.error(`rank ${RANK_B} is not ${FAMILY_NAME_RANK2} (got ${name2}) — abort for safety`);
    process.exit(1);
  }

  console.log("\nplanned:");
  console.log(`  rank ${RANK_A}: ${displayName(rowRank2)} (${rowRank2.competitionEntryId})`);
  console.log(`  rank ${RANK_B}: ${displayName(rowRank1)} (${rowRank1.competitionEntryId})`);

  if (dryRun) {
    console.log("\n[dry-run] no changes written");
    return;
  }

  await prisma.$transaction([
    prisma.officialResultRow.update({
      where: { id: rowRank1.id },
      data: { rank: RANK_B },
    }),
    prisma.officialResultRow.update({
      where: { id: rowRank2.id },
      data: { rank: RANK_A },
    }),
  ]);

  console.log("\n[execute] swapped heat1 rank1 ↔ rank2");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
