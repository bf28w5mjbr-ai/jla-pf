/**
 * 第28回神奈川：オープン女子ビーチスプリント予選（HEAT）
 * スナップショットのヒート割を、確定済み公式結果の heat 構成に合わせる。
 * （07:09 の RECORD_CAPTURE 再生成でヒート割がリザルト確定時とズレた修復）
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-women-beach-sprint-heat-snapshot.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-women-beach-sprint-heat-snapshot.ts --execute
 */
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { getRoundDataFromSnapshot } from "@/lib/heatMarshalFromSnapshot";
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import { reorderRounds, type StartListHeat, type StartListParticipant, type StartListRoundData } from "@/lib/startListRounds";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0009jr044y4c7616";

const execute = process.argv.includes("--execute");
const dryRun = !execute;

async function loadParticipant(entryId: string): Promise<StartListParticipant | null> {
  const entry = await prisma.competitionEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      userId: true,
      club: { select: { id: true, name: true } },
      user: { select: { profile: { select: { familyName: true, givenName: true } } } },
    },
  });
  if (!entry) return null;
  const fn = entry.user.profile?.familyName ?? "";
  const gn = entry.user.profile?.givenName ?? "";
  return {
    kind: "INDIVIDUAL",
    entryId: entry.id,
    userId: entry.userId,
    name: `${fn} ${gn}`.trim(),
    clubId: entry.club?.id ?? null,
    clubName: entry.club?.name ?? null,
  };
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

  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: {
        competitionId: COMPETITION_ID,
        eventId: EVENT_ID,
        round: "HEAT",
      },
    },
    select: {
      rows: {
        where: { competitionEntryId: { not: null } },
        select: {
          competitionEntryId: true,
          heat: true,
          lane: true,
          rank: true,
          competitionEntry: {
            select: {
              user: { select: { profile: { select: { familyName: true, givenName: true } } } },
            },
          },
        },
        orderBy: [{ heat: "asc" }, { lane: "asc" }],
      },
    },
  });

  if (!official?.rows.length) {
    console.error("no official HEAT rows");
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

  const before = extractFrozenRoundsForEventFromSnapshotData(snapshotRow.data, EVENT_ID);
  const currentHeat = before?.find((r) => r.round === "HEAT");
  if (!currentHeat) {
    console.error("no HEAT in snapshot");
    process.exit(1);
  }

  const snapshotPayload = await loadStartListSnapshotPayload(COMPETITION_ID);
  const currentSnapHeat = getRoundDataFromSnapshot(snapshotPayload, EVENT_ID, "HEAT");

  const byOfficialHeat = new Map<number, typeof official.rows>();
  for (const row of official.rows) {
    const h = row.heat ?? 0;
    if (h < 1) continue;
    const list = byOfficialHeat.get(h) ?? [];
    list.push(row);
    byOfficialHeat.set(h, list);
  }

  const allOfficialEntryIds = new Set(
    official.rows.map((r) => r.competitionEntryId).filter((id): id is string => Boolean(id))
  );

  const placedEntryIds = new Set<string>();
  const newHeats: StartListHeat[] = [];

  for (const heatIndex of [...byOfficialHeat.keys()].sort((a, b) => a - b)) {
    const rows = byOfficialHeat.get(heatIndex)!;
    rows.sort((a, b) => (a.lane ?? 99) - (b.lane ?? 99));
    const participants: StartListParticipant[] = [];
    for (const row of rows) {
      const entryId = row.competitionEntryId!;
      const p = await loadParticipant(entryId);
      if (!p) {
        console.error("entry not found:", entryId);
        process.exit(1);
      }
      participants.push(p);
      placedEntryIds.add(entryId);
      const prof = row.competitionEntry?.user.profile;
      console.log(
        `  heat ${heatIndex} rank ${row.rank} lane ${row.lane}: ${prof?.familyName} ${prof?.givenName}`
      );
    }

    // リザルト未入力者のみ、現行スナップショット上の同一ヒート末尾に残す
    const snapHeat = currentSnapHeat?.heats.find((h) => h.heatIndex === heatIndex);
    for (const sp of snapHeat?.participants ?? []) {
      if (sp.kind !== "INDIVIDUAL") continue;
      if (allOfficialEntryIds.has(sp.entryId) || placedEntryIds.has(sp.entryId)) continue;
      const p = await loadParticipant(sp.entryId);
      if (!p) continue;
      participants.push(p);
      placedEntryIds.add(sp.entryId);
      console.log(`  heat ${heatIndex} (no result, kept): ${p.name}`);
    }

    newHeats.push({ heatIndex, participants });
  }

  console.log("\nbefore heats:", currentHeat.heats.map((h) => `${h.heatIndex}(${h.participants.length})`).join(", "));
  console.log("after heats:", newHeats.map((h) => `${h.heatIndex}(${h.participants.length})`).join(", "));

  const newHeatRound: StartListRoundData = {
    round: "HEAT",
    generatedAt: new Date().toISOString(),
    generatedBy: "RECORD_CAPTURE",
    heats: newHeats,
  };

  const tailRounds = (before ?? []).filter((r) => r.round !== "HEAT");
  const nextRounds = reorderRounds([newHeatRound, ...tailRounds]);

  if (dryRun) {
    console.log("\n[dry-run] rounds:", nextRounds.map((r) => r.round).join(", "));
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

  console.log("\n[execute] snapshot HEAT updated");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
