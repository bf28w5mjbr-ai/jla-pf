import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import { getRoundDataFromSnapshot } from "@/lib/heatMarshalFromSnapshot";
import {
  buildPublicHeatResultRoundOverlays,
  formatPublicHeatResultOverlayLabel,
  publicHeatResultOverlayKey,
} from "@/lib/startListPublicHeatResults";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0009jr044y4c7616";

async function main() {
  const [competition, officialResults, snapshot] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: COMPETITION_ID },
      select: { endDate: true },
    }),
    prisma.officialResult.findMany({
      where: { competitionId: COMPETITION_ID, eventId: EVENT_ID, round: "HEAT" },
      select: {
        round: true,
        publishedAt: true,
        lockedAt: true,
        heatConfirmations: { select: { heat: true } },
        rows: {
          select: {
            entryType: true,
            competitionEntryId: true,
            teamEntryId: true,
            rank: true,
            status: true,
            advanceWithoutRank: true,
            heat: true,
            lane: true,
          },
        },
      },
    }),
    loadStartListSnapshotPayload(COMPETITION_ID),
  ]);

  if (!competition) {
    console.log("competition not found");
    return;
  }
  const overlay = buildPublicHeatResultRoundOverlays(officialResults, {
    competitionEndDate: competition.endDate,
  })[0];
  const snapHeat = getRoundDataFromSnapshot(snapshot, EVENT_ID, "HEAT");
  if (!overlay || !snapHeat) {
    console.log("missing overlay or snapshot");
    return;
  }

  const rowByEntry = new Map<string, (typeof overlay.rowsByKey)[string] & { resultHeat: number; lane: number | null }>();
  for (const row of officialResults[0]?.rows ?? []) {
    if (!row.competitionEntryId || row.heat == null) continue;
    const key = `I:${row.competitionEntryId}`;
    rowByEntry.set(key, {
      rank: row.rank,
      status: row.status,
      advanceWithoutRank: row.advanceWithoutRank,
      resultHeat: row.heat,
      lane: row.lane,
    });
  }

  console.log("=== Public page display (snapshot heat × overlay by entryId) ===\n");
  let mismatchCount = 0;

  for (const heat of [...snapHeat.heats].sort((a, b) => a.heatIndex - b.heatIndex)) {
    console.log(`--- Snapshot ヒート ${heat.heatIndex} ---`);
    heat.participants.forEach((p, i) => {
      if (p.kind !== "INDIVIDUAL") return;
      const key = `I:${p.entryId}`;
        const row = overlay.rowsByKey[publicHeatResultOverlayKey(heat.heatIndex, key)];
      const detail = rowByEntry.get(key);
      const label = row ? formatPublicHeatResultOverlayLabel(row) : "—";
      const mismatch =
        detail && detail.resultHeat !== heat.heatIndex
          ? ` ⚠️ 公式結果はヒート${detail.resultHeat}の順位`
          : "";
      if (mismatch) mismatchCount++;
      console.log(
        `  lane ${i + 1}: ${p.name} → 表示 ${label}${mismatch}${detail ? ` (公式 heat=${detail.resultHeat} rank=${detail.rank} lane=${detail.lane})` : ""}`
      );
    });
    console.log("");
  }

  console.log(`mismatches (snapshot heat ≠ official result heat): ${mismatchCount}`);

  console.log("\n=== Official result by heat (what was confirmed) ===\n");
  for (const h of [1, 2, 3]) {
    const rows = (officialResults[0]?.rows ?? [])
      .filter((r) => r.heat === h)
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    console.log(`--- 公式 ヒート ${h} ---`);
    for (const row of rows) {
      const snapHeatIdx = snapHeat.heats.find((sh) =>
        sh.participants.some((p) => p.kind === "INDIVIDUAL" && p.entryId === row.competitionEntryId)
      )?.heatIndex;
      console.log(
        `  rank ${row.rank} lane ${row.lane} entry ${row.competitionEntryId} snapshotHeat=${snapHeatIdx ?? "?"}`
      );
    }
    console.log("");
  }
}

main().finally(() => prisma.$disconnect());
