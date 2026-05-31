/**
 * 公式結果行の heat / lane を、現行スナップショットの HEAT 配置に合わせる。
 * スナップショット再生成（RECORD_CAPTURE 等）後にリザルト heat がずれた場合の修復用。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/realign-official-result-heats-to-snapshot.ts \
 *     --competition-id=... --event-id=... [--round=HEAT] --dry-run
 *   ... --execute
 */
import type { ResultRound } from "@prisma/client";
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import { getRoundDataFromSnapshot } from "@/lib/heatMarshalFromSnapshot";
import { prisma } from "@/server/db";

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const competitionId = parseArg("competition-id");
const eventId = parseArg("event-id");
const round = (parseArg("round") ?? "HEAT").toUpperCase() as ResultRound;
const execute = process.argv.includes("--execute");
const dryRun = !execute;

if (!competitionId || !eventId) {
  console.error("Usage: --competition-id=... --event-id=... [--round=HEAT] --dry-run|--execute");
  process.exit(1);
}

type SnapshotSlot = { heatIndex: number; lane: number };

function buildSnapshotSlotByEntryId(
  snapshot: Awaited<ReturnType<typeof loadStartListSnapshotPayload>>,
  eventIdArg: string,
  roundArg: ResultRound
): Map<string, SnapshotSlot> {
  const map = new Map<string, SnapshotSlot>();
  const roundData = getRoundDataFromSnapshot(snapshot, eventIdArg, roundArg);
  if (!roundData) return map;
  for (const heat of roundData.heats) {
    heat.participants.forEach((p, laneIndex0) => {
      if (p.kind === "INDIVIDUAL") {
        map.set(p.entryId, { heatIndex: heat.heatIndex, lane: laneIndex0 + 1 });
      } else {
        map.set(p.teamEntryId, { heatIndex: heat.heatIndex, lane: laneIndex0 + 1 });
      }
    });
  }
  return map;
}

async function main() {
  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: { competitionId, eventId, round },
    },
    select: {
      id: true,
      lockedAt: true,
      rows: {
        select: {
          id: true,
          entryType: true,
          competitionEntryId: true,
          teamEntryId: true,
          heat: true,
          lane: true,
          rank: true,
          status: true,
          competitionEntry: {
            select: {
              user: { select: { profile: { select: { familyName: true, givenName: true } } } },
            },
          },
        },
      },
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

  const snapshot = await loadStartListSnapshotPayload(competitionId);
  const slotByEntry = buildSnapshotSlotByEntryId(snapshot, eventId, round);

  const updates: Array<{
    rowId: string;
    name: string;
    rank: number | null;
    from: { heat: number | null; lane: number | null };
    to: SnapshotSlot;
  }> = [];

  for (const row of official.rows) {
    const entryId =
      row.entryType === "TEAM" ? row.teamEntryId : row.competitionEntryId;
    if (!entryId) continue;
    const slot = slotByEntry.get(entryId);
    if (!slot) {
      console.warn("skip (not in snapshot):", entryId, row.rank);
      continue;
    }
    if (row.heat === slot.heatIndex && row.lane === slot.lane) continue;
    const p = row.competitionEntry?.user.profile;
    const name = p ? `${p.familyName} ${p.givenName}` : entryId;
    updates.push({
      rowId: row.id,
      name,
      rank: row.rank,
      from: { heat: row.heat, lane: row.lane },
      to: slot,
    });
  }

  console.log(`officialResultId: ${official.id}`);
  console.log(`updates: ${updates.length}`);
  for (const u of updates) {
    console.log(
      `  ${u.name} rank=${u.rank ?? "—"}: heat ${u.from.heat} lane ${u.from.lane} → heat ${u.to.heatIndex} lane ${u.to.lane}`
    );
  }

  if (updates.length === 0) {
    console.log("nothing to update");
    return;
  }

  if (dryRun) {
    console.log("\n[dry-run] no changes written");
    return;
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.officialResultRow.update({
        where: { id: u.rowId },
        data: { heat: u.to.heatIndex, lane: u.to.lane },
      })
    )
  );

  console.log("\n[execute] realigned", updates.length, "rows");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
