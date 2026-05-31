/**
 * 第28回神奈川：U-8ビーチスプリント（男子）ヒート1 2位 ↔ ヒート2 7位 を入れ替え。
 * 粟飯原 一悟 ⇄ マイヤー エーロン
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u8-beach-sprint-swap-results.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u8-beach-sprint-swap-results.ts --execute
 */
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import { getRoundDataFromSnapshot } from "@/lib/heatMarshalFromSnapshot";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnumsc280009kv04nfcp48o4";
const ROUND = "HEAT" as const;

/** 粟飯原 一悟（DB 表記） */
const AWIHARA_ENTRY_ID = "cmovmmcic0001l704tah3iwuu";
/** マイヤー エーロン晟 */
const MAYER_ENTRY_ID = "cmola8xrg0005jl04w9hubj8m";

const HEAT1_RANK = 2;
const HEAT2_RANK = 7;

const execute = process.argv.includes("--execute");
const dryRun = !execute;

function findLaneInHeat(
  snapshot: Awaited<ReturnType<typeof loadStartListSnapshotPayload>>,
  heatIndex: number,
  entryId: string
): number | null {
  const round = getRoundDataFromSnapshot(snapshot, EVENT_ID, ROUND);
  const heat = round?.heats?.find((h) => h.heatIndex === heatIndex);
  if (!heat) return null;
  const idx = heat.participants?.findIndex(
    (p) => p.kind === "INDIVIDUAL" && p.entryId === entryId
  );
  if (idx == null || idx < 0) return null;
  return idx + 1;
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
        where: {
          OR: [
            { heat: 1, rank: HEAT1_RANK },
            { heat: 2, rank: HEAT2_RANK },
          ],
        },
        include: {
          competitionEntry: {
            select: {
              user: { select: { profile: { select: { familyName: true, givenName: true } } } },
            },
          },
        },
      },
      heatConfirmations: { where: { heat: { in: [1, 2] } }, select: { heat: true } },
    },
  });

  if (!official) {
    console.error("OfficialResult not found");
    process.exit(1);
  }
  if (official.lockedAt) {
    console.error("OfficialResult is locked — abort");
    process.exit(1);
  }

  const rowHeat1Rank2 = official.rows.find((r) => r.heat === 1 && r.rank === HEAT1_RANK);
  const rowHeat2Rank7 = official.rows.find((r) => r.heat === 2 && r.rank === HEAT2_RANK);

  console.log("officialResultId:", official.id);
  console.log("heat confirmed:", official.heatConfirmations.map((h) => h.heat));

  const name = (entryId: string | null | undefined) => {
    const row = official.rows.find((r) => r.competitionEntryId === entryId);
    const p = row?.competitionEntry?.user.profile;
    return p ? `${p.familyName} ${p.givenName}` : entryId;
  };

  console.log("\ncurrent heat1 rank2:", rowHeat1Rank2?.competitionEntryId, name(rowHeat1Rank2?.competitionEntryId));
  console.log("current heat2 rank7:", rowHeat2Rank7?.competitionEntryId, name(rowHeat2Rank7?.competitionEntryId));

  if (rowHeat1Rank2?.competitionEntryId !== AWIHARA_ENTRY_ID) {
    console.error("heat1 rank2 is not 粟飯原 一悟 — abort for safety");
    process.exit(1);
  }
  if (rowHeat2Rank7?.competitionEntryId !== MAYER_ENTRY_ID) {
    console.error("heat2 rank7 is not マイヤー — abort for safety");
    process.exit(1);
  }

  const snapshot = await loadStartListSnapshotPayload(COMPETITION_ID);
  const awiharaLaneHeat1 = findLaneInHeat(snapshot, 1, AWIHARA_ENTRY_ID);
  const mayerLaneHeat2 = findLaneInHeat(snapshot, 2, MAYER_ENTRY_ID);

  console.log("\nAwihara lane in heat1 (snapshot):", awiharaLaneHeat1);
  console.log("Mayer lane in heat2 (snapshot):", mayerLaneHeat2);

  if (awiharaLaneHeat1 == null) {
    console.error("粟飯原 is not in heat1 snapshot — check start list");
    process.exit(1);
  }
  if (mayerLaneHeat2 == null) {
    console.error("マイヤー is not in heat2 snapshot — check start list");
    process.exit(1);
  }

  console.log("\nplanned:");
  console.log(
    `  heat1 rank${HEAT1_RANK} → マイヤー (entry ${MAYER_ENTRY_ID}, lane ${awiharaLaneHeat1})`
  );
  console.log(
    `  heat2 rank${HEAT2_RANK} → 粟飯原 (entry ${AWIHARA_ENTRY_ID}, lane ${mayerLaneHeat2})`
  );

  if (dryRun) {
    console.log("\n[dry-run] no changes written");
    return;
  }

  await prisma.$transaction([
    prisma.officialResultRow.update({
      where: { id: rowHeat1Rank2!.id },
      data: {
        competitionEntryId: MAYER_ENTRY_ID,
        lane: awiharaLaneHeat1,
      },
    }),
    prisma.officialResultRow.update({
      where: { id: rowHeat2Rank7!.id },
      data: {
        competitionEntryId: AWIHARA_ENTRY_ID,
        lane: mayerLaneHeat2,
      },
    }),
  ]);

  console.log("\n[execute] swapped heat1 rank2 ↔ heat2 rank7");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
