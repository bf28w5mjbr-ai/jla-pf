/**
 * 次ラウンド自動追記の診断・手動再実行。
 *
 * pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/diagnose-next-round-auto-append.ts \
 *   --competition-id=... --event-id=... [--run]
 */
import { getRoundDataFromSnapshot, heatIndexMatchesSnapshot } from "@/lib/heatMarshalFromSnapshot";
import { loadStartListSnapshotPayloadLoose } from "@/lib/heatMarshalGate";
import {
  areAllSnapshotHeatsResultConfirmed,
  tryAutoAppendNextStartListRound,
} from "@/lib/startListNextRoundFromOfficial";
import { prisma } from "@/server/db";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main() {
  const competitionId = arg("competition-id");
  const eventId = arg("event-id");
  const run = process.argv.includes("--run");
  const competitionName = arg("competition-name") ?? "第28回神奈川県ライフセービング選手権大会";
  const eventNameContains = arg("event-name") ?? "オープンボード";

  let cid = competitionId;
  let eid = eventId;

  if (!cid) {
    const comp = await prisma.competition.findFirst({
      where: { name: { contains: competitionName } },
      select: { id: true, name: true },
    });
    if (!comp) {
      console.error("大会が見つかりません:", competitionName);
      process.exit(1);
    }
    cid = comp.id;
    console.log("competition:", comp.name, cid);
  }

  if (!eid) {
    const ev = await prisma.event.findFirst({
      where: { competitionId: cid, name: { contains: eventNameContains } },
      select: {
        id: true,
        name: true,
        type: true,
        startListRoundCount: true,
        preliminaryHeatLaneCount: true,
      },
    });
    if (!ev) {
      console.error("種目が見つかりません:", eventNameContains);
      process.exit(1);
    }
    eid = ev.id;
    console.log("event:", ev.name, eid, ev);
  }

  const snapshot = await loadStartListSnapshotPayloadLoose(cid);
  const heatRound = getRoundDataFromSnapshot(snapshot, eid, "HEAT");
  const heatIndices = (heatRound?.heats ?? []).map((h) => h.heatIndex);
  console.log("snapshot HEAT heatIndex values:", heatIndices);

  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: { competitionId: cid, eventId: eid, round: "HEAT" },
    },
    include: {
      heatConfirmations: { select: { heat: true } },
      rows: { where: { status: "OK" }, select: { heat: true, rank: true, entryType: true } },
    },
  });

  console.log("official HEAT:", {
    id: official?.id,
    rowCount: official?.rows.length ?? 0,
    confirmedHeats: official?.heatConfirmations.map((c) => c.heat) ?? [],
    lockedAt: official?.lockedAt?.toISOString() ?? null,
  });

  if (official?.id) {
    const allConfirmed = await areAllSnapshotHeatsResultConfirmed({
      competitionId: cid,
      eventId: eid,
      round: "HEAT",
      officialResultId: official.id,
    });
    console.log("areAllSnapshotHeatsResultConfirmed:", allConfirmed);

    const needed = [...new Set(heatIndices.map((h) => Number(h)).filter((n) => Number.isFinite(n)))];
    const confirmed = official.heatConfirmations.map((c) => c.heat);
    for (const h of needed) {
      const ok = confirmed.some((c) => heatIndexMatchesSnapshot(h, c));
      if (!ok) console.log("  MISSING confirm for snapshot heat", h, "confirmed DB heats:", confirmed);
    }
  }

  const snapRaw = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: cid },
    select: { data: true },
  });
  const events = (snapRaw?.data as { events?: Array<{ eventId: string; rounds?: Array<{ round: string; generatedBy?: string; heats?: unknown[] }> }> })?.events ?? [];
  const evSnap = events.find((e) => e.eventId === eid);
  console.log(
    "snapshot rounds:",
    evSnap?.rounds?.map((r) => ({
      round: r.round,
      generatedBy: r.generatedBy,
      heatCount: r.heats?.length ?? 0,
    }))
  );

  if (run) {
    console.log("\n--- running tryAutoAppendNextStartListRound ---");
    const result = await tryAutoAppendNextStartListRound({
      competitionId: cid,
      eventId: eid,
      finishedRound: "HEAT",
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("\n再実行するには --run を付けてください");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
