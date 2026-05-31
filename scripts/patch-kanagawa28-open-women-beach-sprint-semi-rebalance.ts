/**
 * 第28回神奈川：オープン女子ビーチスプリント SEMI
 * 10/7 分割 → 8/9 に再配分（17人・2ヒート）
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-women-beach-sprint-semi-rebalance.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-women-beach-sprint-semi-rebalance.ts --execute
 */
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { computePlacementSeed } from "@/lib/startListHeatPlacement";
import {
  assignParticipantsInOrderToHeats,
  buildNextRoundHeatsFromPreviousResults,
  reorderRounds,
  type StartListHeat,
  type StartListParticipant,
  type StartListRoundData,
} from "@/lib/startListRounds";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0009jr044y4c7616";

const execute = process.argv.includes("--execute");
const dryRun = !execute;

function participantSortKey(p: StartListParticipant): string {
  return p.kind === "INDIVIDUAL" ? p.entryId : p.teamEntryId;
}

function orderedParticipantsForSemi(participants: StartListParticipant[]): StartListParticipant[] {
  const shuffleFingerprint = [...participants]
    .map(participantSortKey)
    .sort()
    .join(",");
  const shuffleSeed = computePlacementSeed(
    COMPETITION_ID,
    EVENT_ID,
    `nextRound:HEAT>SEMI:${shuffleFingerprint}`
  );
  const rebuilt = buildNextRoundHeatsFromPreviousResults({
    participants,
    heatCount: 2,
    shuffleSeed,
  });
  return rebuilt.flatMap((h) => h.participants);
}

/** 8/9 配分（ヒート1=8, ヒート2=9） */
function assignEightNine(participants: StartListParticipant[]): StartListHeat[] {
  const ordered = orderedParticipantsForSemi(participants);
  const nineEight = assignParticipantsInOrderToHeats(ordered, 2);
  return [
    { heatIndex: 1, participants: nineEight[1]?.participants ?? [] },
    { heatIndex: 2, participants: nineEight[0]?.participants ?? [] },
  ];
}

async function main() {
  const event = await prisma.event.findFirst({
    where: { id: EVENT_ID, competitionId: COMPETITION_ID },
    select: { id: true, name: true, sex: true, type: true },
  });
  if (!event) {
    console.error("event not found");
    process.exit(1);
  }

  const snapshotRow = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { id: true, data: true },
  });
  if (!snapshotRow?.data) {
    console.error("no snapshot");
    process.exit(1);
  }

  const beforeRounds = extractFrozenRoundsForEventFromSnapshotData(snapshotRow.data, EVENT_ID);
  const currentSemi = beforeRounds?.find((r) => r.round === "SEMI");
  if (!currentSemi) {
    console.error("no SEMI in snapshot");
    process.exit(1);
  }

  const allParticipants = currentSemi.heats.flatMap((h) => h.participants);
  console.log(
    "before:",
    currentSemi.heats.map((h) => `${h.heatIndex}(${h.participants.length})`).join(", ")
  );

  const newHeats = assignEightNine(allParticipants);
  console.log(
    "after:",
    newHeats.map((h) => `${h.heatIndex}(${h.participants.length})`).join(", ")
  );
  for (const h of newHeats) {
    console.log(`\nHeat ${h.heatIndex}:`);
    for (const p of h.participants) {
      if (p.kind !== "INDIVIDUAL") continue;
      console.log(`  ${p.name} srcHeat=${p.sourceHeat} rank=${p.sourceRank}`);
    }
  }

  const heatRound = beforeRounds?.find((r) => r.round === "HEAT");
  const newSemiRound: StartListRoundData = {
    ...currentSemi,
    generatedAt: new Date().toISOString(),
    generatedBy: "RESULT_BASED",
    sourceRound: "HEAT",
    heats: newHeats,
  };
  const nextRounds = reorderRounds([
    ...(heatRound ? [heatRound] : []),
    newSemiRound,
    ...(beforeRounds ?? []).filter((r) => r.round !== "HEAT" && r.round !== "SEMI"),
  ]);

  if (dryRun) {
    console.log("\n[dry-run] done");
    return;
  }

  const raw = snapshotRow.data as { version?: number; capturedAt?: string; events?: unknown[] };
  const events = Array.isArray(raw.events) ? [...raw.events] : [];
  const idx = events.findIndex(
    (e) => e && typeof e === "object" && (e as { eventId?: string }).eventId === EVENT_ID
  );
  const prevBlock =
    idx >= 0 && events[idx] && typeof events[idx] === "object"
      ? (events[idx] as Record<string, unknown>)
      : {};
  const nextBlock = {
    ...prevBlock,
    eventId: event.id,
    name: event.name,
    sex: event.sex,
    type: event.type,
    rounds: nextRounds,
  };
  if (idx >= 0) events[idx] = nextBlock;
  else events.push(nextBlock);

  const now = new Date();
  await prisma.competitionStartListSnapshot.update({
    where: { competitionId: COMPETITION_ID },
    data: {
      data: {
        ...raw,
        version: typeof raw.version === "number" ? raw.version : 2,
        capturedAt: now.toISOString(),
        events,
      },
      capturedAt: now,
    },
  });

  console.log("\n[execute] SEMI rebalanced to 8/9");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
