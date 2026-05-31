import { prisma } from "@/server/db";
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import { getRoundDataFromSnapshot, listMarshalRoundsInSnapshotForEvent } from "@/lib/heatMarshalFromSnapshot";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0004jr04my5mzm2t";

async function main() {
  const snapRow = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { data: true, capturedAt: true },
  });
  const frozen = extractFrozenRoundsForEventFromSnapshotData(snapRow?.data, EVENT_ID);
  console.log("frozen rounds:", frozen?.map((r) => `${r.round}(${r.heats.length} heats)`));

  const snap = await loadStartListSnapshotPayload(COMPETITION_ID);
  console.log("marshal rounds:", listMarshalRoundsInSnapshotForEvent(snap, EVENT_ID));

  for (const round of ["HEAT", "SEMI", "FINAL"] as const) {
    const rd = getRoundDataFromSnapshot(snap, EVENT_ID, round);
    if (!rd) continue;
    console.log(`\n${round}:`);
    for (const h of rd.heats) {
      console.log(` heat ${h.heatIndex} (${h.participants.length})`);
      h.participants.forEach((p, i) => {
        if (p.kind === "INDIVIDUAL") console.log(`   L${i + 1} ${p.name} ${p.entryId}`);
      });
    }
  }

  const officials = await prisma.officialResult.findMany({
    where: { competitionId: COMPETITION_ID, eventId: EVENT_ID },
    select: {
      round: true,
      id: true,
      lockedAt: true,
      rows: { orderBy: [{ heat: "asc" }, { rank: "asc" }] },
      heatConfirmations: { select: { heat: true } },
    },
  });
  const drafts = await prisma.competitionResultDraft.findMany({
    where: { eventId: EVENT_ID },
    select: { round: true, id: true },
  });
  console.log("drafts:", drafts);
  const semiCaptures = await prisma.competitionHeatResultCaptureEvent.count({
    where: { eventId: EVENT_ID, round: "SEMI" },
  });
  console.log("SEMI capture events:", semiCaptures);

  console.log("\nofficial results:", officials.map((o) => o.round));
  for (const o of officials) {
    console.log(`\n${o.round} id=${o.id} locked=${o.lockedAt} confirms=${o.heatConfirmations.map((c) => c.heat)}`);
    for (const row of o.rows) {
      const entry = row.competitionEntryId
        ? await prisma.competitionEntry.findUnique({
            where: { id: row.competitionEntryId },
            select: {
              user: { select: { profile: { select: { familyName: true, givenName: true } } } },
            },
          })
        : null;
      const n = entry?.user.profile
        ? `${entry.user.profile.familyName} ${entry.user.profile.givenName}`
        : "?";
      console.log(`  h${row.heat} rank${row.rank} lane${row.lane} ${n}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
